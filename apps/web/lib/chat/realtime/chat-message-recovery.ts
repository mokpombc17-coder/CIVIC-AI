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
  roomId: string;
  throughSequence: number;
}>;

export async function recoverChatMessageHistory(
  queryClient: QueryClient,
  {
    api,
    limit = DEFAULT_MESSAGE_HISTORY_LIMIT,
    roomId,
    throughSequence,
  }: RecoverChatMessageHistoryOptions,
): Promise<ChatMessageRecoveryResult> {
  assertSequence(throughSequence);

  const queryKey = chatRoomQueryKeys.messageHistory(roomId, limit);
  const initialHistory = queryClient.getQueryData<ChatMessageHistoryData>(queryKey);

  if (!initialHistory || initialHistory.pages.length === 0) {
    throw new ChatMessageRecoveryError(
      "MESSAGE_HISTORY_NOT_READY",
      `채팅방 ${roomId}의 REST 메시지 snapshot이 아직 cache에 없습니다.`,
    );
  }

  const initialMerge = inspectMessageHistory(roomId, initialHistory);
  const fromSequence = initialMerge.lastContiguousSequence ?? 0;

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
    recoveredMessages.push(...response.items);
    workingHistory = mergeMessagesIntoChatHistory(roomId, workingHistory, response.items).history;

    const recoveryMerge = inspectMessageHistory(roomId, workingHistory, fromSequence);
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
  const finalMerge = inspectMessageHistory(roomId, finalHistory, fromSequence);
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
): number {
  return inspectMessageHistory(roomId, history).lastContiguousSequence ?? 0;
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

  const latestPage = history.pages[0]!;
  const olderMessages = history.pages.slice(1).flatMap((page) => page.items);
  const olderMessageIds = new Set(olderMessages.map((message) => message.messageId));
  const olderRoomSequences = new Set(olderMessages.map((message) => message.roomSequence));
  const latestItems = merge.messages.filter(
    (message) =>
      !olderMessageIds.has(message.messageId) && !olderRoomSequences.has(message.roomSequence),
  );

  return {
    history: {
      ...history,
      pages: [
        {
          ...latestPage,
          items: latestItems,
        },
        ...history.pages.slice(1),
      ],
    },
    merge,
  };
}

function inspectMessageHistory(
  roomId: string,
  history: ChatMessageHistoryData,
  afterSequence?: number,
): ChatMessageMergeResult {
  return mergeChatMessages({
    roomId,
    sources: history.pages.map((page) => page.items),
    ...(afterSequence === undefined ? {} : { afterSequence }),
  });
}

function assertSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError("복구 목표 sequence는 0 이상의 안전한 정수여야 합니다.");
  }
}
