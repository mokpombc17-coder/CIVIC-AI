import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { chatRoomQueryKeys, DEFAULT_MESSAGE_HISTORY_LIMIT } from "../chat-room-queries";
import type { ChatMessage, MessageHistoryResponse } from "../chat-room-contracts";
import {
  refreshLoadedChatMessageSnapshots,
  type ChatMessageSnapshotRefreshResult,
} from "./chat-message-snapshot-refresh";

describe("refreshLoadedChatMessageSnapshots", () => {
  it("기존 latest/beforeSequence page parameter로 로드 범위 snapshot만 갱신한다", async () => {
    const queryClient = new QueryClient();
    seedMessageHistory(queryClient);
    const updatedMessage4 = createUpdatedMessage(4, 2);
    const deletedMessage2 = createDeletedMessage(2, 3);
    const getRoomMessages = vi
      .fn()
      .mockResolvedValueOnce(createResponse([updatedMessage4, createMessage(5)]))
      .mockResolvedValueOnce(createResponse([deletedMessage2]));

    const result = await refreshLoadedChatMessageSnapshots(queryClient, {
      api: { getRoomMessages },
      roomId: "room-01",
    });

    expect(getRoomMessages.mock.calls).toEqual([
      [
        "room-01",
        {
          mode: "latest",
          limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
        },
      ],
      [
        "room-01",
        {
          mode: "before",
          beforeSequence: 3,
          limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
        },
      ],
    ]);
    expect(result).toEqual<ChatMessageSnapshotRefreshResult>({
      pageCount: 2,
      refreshedMessageCount: 2,
    });

    const history = getMessageHistory(queryClient);
    expect(history.pageParams).toEqual([null, 3]);
    expect(history.pages[0]?.items).toEqual([createMessage(3), updatedMessage4]);
    expect(history.pages[1]?.items).toEqual([createMessage(1), deletedMessage2]);
    expect(history.pages.flatMap((page) => page.items)).not.toContainEqual(createMessage(5));
  });

  it("일부 page 재조회가 실패하면 cache를 부분 갱신하지 않는다", async () => {
    const queryClient = new QueryClient();
    seedMessageHistory(queryClient);
    const initialHistory = getMessageHistory(queryClient);
    const getRoomMessages = vi
      .fn()
      .mockResolvedValueOnce(createResponse([createUpdatedMessage(4, 2)]))
      .mockRejectedValueOnce(new Error("이전 페이지 조회 실패"));

    await expect(
      refreshLoadedChatMessageSnapshots(queryClient, {
        api: { getRoomMessages },
        roomId: "room-01",
      }),
    ).rejects.toThrow("이전 페이지 조회 실패");

    expect(getMessageHistory(queryClient)).toBe(initialHistory);
  });
});

function seedMessageHistory(queryClient: QueryClient): void {
  const history: InfiniteData<MessageHistoryResponse, number | null> = {
    pages: [
      createResponse([createMessage(3), createMessage(4)], {
        hasMore: true,
        nextBeforeSequence: 3,
      }),
      createResponse([createMessage(1), createMessage(2)]),
    ],
    pageParams: [null, 3],
  };

  queryClient.setQueryData(
    chatRoomQueryKeys.messageHistory("room-01", DEFAULT_MESSAGE_HISTORY_LIMIT),
    history,
  );
}

function getMessageHistory(
  queryClient: QueryClient,
): InfiniteData<MessageHistoryResponse, number | null> {
  return queryClient.getQueryData(
    chatRoomQueryKeys.messageHistory("room-01", DEFAULT_MESSAGE_HISTORY_LIMIT),
  )!;
}

function createResponse(
  items: readonly ChatMessage[],
  overrides: Partial<Omit<MessageHistoryResponse, "items">> = {},
): MessageHistoryResponse {
  return {
    items: [...items],
    nextBeforeSequence: null,
    nextAfterSequence: null,
    hasMore: false,
    ...overrides,
  };
}

function createMessage(roomSequence: number): Extract<ChatMessage, { state: "ACTIVE" }> {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    senderUserId: "local-user-1",
    clientMessageId: `00000000-0000-4000-8000-${String(roomSequence).padStart(12, "0")}`,
    content: `메시지 ${roomSequence}`,
    createdAt: "2026-07-29T04:40:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE",
    updatedAt: "2026-07-29T04:40:00Z",
  };
}

function createUpdatedMessage(
  roomSequence: number,
  messageVersion: number,
): Extract<ChatMessage, { state: "ACTIVE" }> {
  return {
    ...createMessage(roomSequence),
    content: `수정된 메시지 ${roomSequence}`,
    messageVersion,
    updatedAt: "2026-07-29T04:41:00Z",
  };
}

function createDeletedMessage(
  roomSequence: number,
  messageVersion: number,
): Extract<ChatMessage, { state: "DELETED_BY_AUTHOR" }> {
  return {
    ...createMessage(roomSequence),
    content: null,
    deletedAt: "2026-07-29T04:42:00Z",
    messageVersion,
    state: "DELETED_BY_AUTHOR",
    updatedAt: "2026-07-29T04:42:00Z",
  };
}
