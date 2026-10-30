import type { QueryClient } from "@tanstack/react-query";
import type { ChatRoomApi } from "../chat-room-api";
import type { ChatMessage } from "../chat-room-contracts";
import { chatRoomQueryKeys, DEFAULT_MESSAGE_HISTORY_LIMIT } from "../chat-room-queries";
import { mergeMessagesIntoChatHistory, type ChatMessageHistoryData } from "./chat-message-recovery";

export type ChatMessageSnapshotRefreshResult = Readonly<{
  pageCount: number;
  refreshedMessageCount: number;
}>;

type RefreshLoadedChatMessageSnapshotsOptions = Readonly<{
  api: Pick<ChatRoomApi, "getRoomMessages">;
  limit?: number;
  roomId: string;
}>;

export class ChatMessageSnapshotRefreshError extends Error {
  override readonly name = "ChatMessageSnapshotRefreshError";

  constructor(
    readonly code: "MESSAGE_HISTORY_NOT_READY",
    message: string,
  ) {
    super(message);
  }
}

export async function refreshLoadedChatMessageSnapshots(
  queryClient: QueryClient,
  { api, limit = DEFAULT_MESSAGE_HISTORY_LIMIT, roomId }: RefreshLoadedChatMessageSnapshotsOptions,
): Promise<ChatMessageSnapshotRefreshResult> {
  const queryKey = chatRoomQueryKeys.messageHistory(roomId, limit);
  const initialHistory = queryClient.getQueryData<ChatMessageHistoryData>(queryKey);

  if (!initialHistory || initialHistory.pages.length === 0) {
    throw new ChatMessageSnapshotRefreshError(
      "MESSAGE_HISTORY_NOT_READY",
      `채팅방 ${roomId}의 REST 메시지 snapshot이 아직 cache에 없습니다.`,
    );
  }

  const loadedMessageIds = new Set(
    initialHistory.pages.flatMap((page) => page.items.map((message) => message.messageId)),
  );
  const refreshedSnapshots: ChatMessage[] = [];

  for (const pageParam of initialHistory.pageParams) {
    const response = await api.getRoomMessages(
      roomId,
      pageParam === null
        ? {
            mode: "latest",
            limit,
          }
        : {
            mode: "before",
            beforeSequence: pageParam,
            limit,
          },
    );

    refreshedSnapshots.push(
      ...response.items.filter((message) => loadedMessageIds.has(message.messageId)),
    );
  }

  const currentHistory =
    queryClient.getQueryData<ChatMessageHistoryData>(queryKey) ?? initialHistory;
  const { history } = mergeMessagesIntoChatHistory(roomId, currentHistory, refreshedSnapshots);

  if (history !== currentHistory) {
    queryClient.setQueryData(queryKey, history);
  }

  return {
    pageCount: initialHistory.pageParams.length,
    refreshedMessageCount: refreshedSnapshots.length,
  };
}
