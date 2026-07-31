import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { ChatMessageMergeResult } from "../chat-message-merge";
import { mergeChatMessages } from "../chat-message-merge";
import type { ChatRoomApi } from "../chat-room-api";
import type { ChatMessage, MessageHistoryResponse } from "../chat-room-contracts";
import { chatRoomQueryKeys, DEFAULT_MESSAGE_HISTORY_LIMIT } from "../chat-room-queries";

export type ChatMessageHistoryData = InfiniteData<MessageHistoryResponse, number | null>;

export type ChatMessageRecoveryResult = Readonly<{
  fromSequence: number;
  recoveredMessageCount: number;
  requestCount: number;
  throughSequence: number;
}>;

export class ChatMessageRecoveryError extends Error {
  override readonly name = "ChatMessageRecoveryError";

  constructor(
    readonly code:
      "MESSAGE_HISTORY_NOT_READY" | "MESSAGE_RECOVERY_STALLED" | "MESSAGE_RECOVERY_INCOMPLETE",
    message: string,
  ) {
    super(message);
  }
}

type RecoverChatMessageHistoryOptions = Readonly<{
  api: Pick<ChatRoomApi, "getRoomMessages">;
  limit?: number;
  messageVisibleAfterSequence: number;
  roomId: string;
  throughSequence: number;
}>;

export async function recoverChatMessageHistory(
  queryClient: QueryClient,
  {
    api,
    limit = DEFAULT_MESSAGE_HISTORY_LIMIT,
    messageVisibleAfterSequence,
    roomId,
    throughSequence,
  }: RecoverChatMessageHistoryOptions,
): Promise<ChatMessageRecoveryResult> {
  assertSequence(throughSequence);
  assertSequence(messageVisibleAfterSequence);

  const queryKey = chatRoomQueryKeys.messageHistory(roomId, limit);
  const initialHistory = queryClient.getQueryData<ChatMessageHistoryData>(queryKey);

  if (!initialHistory || initialHistory.pages.length === 0) {
    throw new ChatMessageRecoveryError(
      "MESSAGE_HISTORY_NOT_READY",
      `채팅방 ${roomId}의 REST 메시지 snapshot이 아직 cache에 없습니다.`,
    );
  }

  const initialMerge = inspectMessageHistory(roomId, initialHistory, messageVisibleAfterSequence);
  const fromSequence = initialMerge.lastContiguousSequence ?? messageVisibleAfterSequence;

  if (fromSequence >= throughSequence) {
    return {
      fromSequence,
      recoveredMessageCount: 0,
      requestCount: 0,
      throughSequence: fromSequence,
    };
  }

  const recoveredMessages: ChatMessage[] = [];
  let workingHistory = initialHistory;
  let afterSequence = fromSequence;
  let lastContiguousSequence = fromSequence;
  let requestCount = 0;

  while (lastContiguousSequence < throughSequence) {
    const response = await api.getRoomMessages(roomId, {
      mode: "after",
      afterSequence,
      limit,
    });
    requestCount += 1;
    const visibleItems = response.items.filter(
      (message) => message.roomSequence > messageVisibleAfterSequence,
    );
    recoveredMessages.push(...visibleItems);
    workingHistory = mergeMessagesIntoChatHistory(roomId, workingHistory, visibleItems).history;

    const recoveryMerge = inspectMessageHistory(
      roomId,
      workingHistory,
      messageVisibleAfterSequence,
      fromSequence,
    );
    const nextContiguousSequence = recoveryMerge.lastContiguousSequence ?? fromSequence;

    if (nextContiguousSequence <= lastContiguousSequence) {
      throw new ChatMessageRecoveryError(
        "MESSAGE_RECOVERY_STALLED",
        `채팅방 ${roomId}의 메시지 복구가 sequence ${lastContiguousSequence}에서 진행되지 않았습니다.`,
      );
    }

    lastContiguousSequence = nextContiguousSequence;

    if (!response.hasMore && lastContiguousSequence < throughSequence) {
      throw new ChatMessageRecoveryError(
        "MESSAGE_RECOVERY_INCOMPLETE",
        `채팅방 ${roomId}의 메시지를 sequence ${throughSequence}까지 복구하지 못했습니다.`,
      );
    }

    if (lastContiguousSequence < throughSequence) {
      const nextAfterSequence = response.nextAfterSequence;

      if (
        nextAfterSequence === null ||
        nextAfterSequence <= afterSequence ||
        nextAfterSequence > lastContiguousSequence
      ) {
        throw new ChatMessageRecoveryError(
          "MESSAGE_RECOVERY_STALLED",
          `채팅방 ${roomId}의 afterSequence cursor가 연속 복구 범위를 벗어났습니다.`,
        );
      }

      afterSequence = nextAfterSequence;
    }
  }

  const currentHistory =
    queryClient.getQueryData<ChatMessageHistoryData>(queryKey) ?? initialHistory;
  const finalHistory = mergeMessagesIntoChatHistory(
    roomId,
    currentHistory,
    recoveredMessages,
  ).history;
  const finalMerge = inspectMessageHistory(
    roomId,
    finalHistory,
    messageVisibleAfterSequence,
    fromSequence,
  );
  const finalSequence = finalMerge.lastContiguousSequence ?? fromSequence;

  if (finalSequence < throughSequence) {
    throw new ChatMessageRecoveryError(
      "MESSAGE_RECOVERY_INCOMPLETE",
      `채팅방 ${roomId}의 cache를 sequence ${throughSequence}까지 복구하지 못했습니다.`,
    );
  }

  queryClient.setQueryData(queryKey, finalHistory);

  return {
    fromSequence,
    recoveredMessageCount: recoveredMessages.length,
    requestCount,
    throughSequence: finalSequence,
  };
}

export function getLastContiguousMessageSequence(
  roomId: string,
  history: ChatMessageHistoryData,
  messageVisibleAfterSequence: number,
): number {
  assertSequence(messageVisibleAfterSequence);

  return (
    inspectMessageHistory(roomId, history, messageVisibleAfterSequence).lastContiguousSequence ??
    messageVisibleAfterSequence
  );
}

export function mergeMessagesIntoChatHistory(
  roomId: string,
  history: ChatMessageHistoryData,
  incomingMessages: readonly ChatMessage[],
): Readonly<{
  history: ChatMessageHistoryData;
  merge: ChatMessageMergeResult;
}> {
  const merge = mergeChatMessages({
    roomId,
    sources: [...history.pages.map((page) => page.items), incomingMessages],
  });

  if (incomingMessages.length === 0) {
    return { history, merge };
  }

  const mergedMessagesById = new Map(
    merge.messages.map((message) => [message.messageId, message] as const),
  );
  const existingMessageIds = new Set(
    history.pages.flatMap((page) => page.items.map((message) => message.messageId)),
  );
  let changed = false;
  const pages = history.pages.map((page) => {
    const items = page.items.map((message) => {
      const mergedMessage = mergedMessagesById.get(message.messageId) ?? message;

      if (mergedMessage !== message) {
        changed = true;
      }

      return mergedMessage;
    });

    return items.some((message, index) => message !== page.items[index])
      ? { ...page, items }
      : page;
  });
  const newMessages = merge.messages.filter(
    (message) => !existingMessageIds.has(message.messageId),
  );

  if (newMessages.length > 0) {
    changed = true;
    const latestPage = pages[0]!;
    pages[0] = {
      ...latestPage,
      items: [...latestPage.items, ...newMessages].sort(
        (left, right) => left.roomSequence - right.roomSequence,
      ),
    };
  }

  if (!changed) {
    return { history, merge };
  }

  return {
    history: {
      ...history,
      pages,
    },
    merge,
  };
}

function inspectMessageHistory(
  roomId: string,
  history: ChatMessageHistoryData,
  messageVisibleAfterSequence: number,
  afterSequence?: number,
): ChatMessageMergeResult {
  return mergeChatMessages({
    roomId,
    sources: history.pages.map((page) =>
      page.items.filter((message) => message.roomSequence > messageVisibleAfterSequence),
    ),
    ...(afterSequence === undefined ? {} : { afterSequence }),
  });
}

function assertSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError("복구 목표 sequence는 0 이상의 안전한 정수여야 합니다.");
  }
}
