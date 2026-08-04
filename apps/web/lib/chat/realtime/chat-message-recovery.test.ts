import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, MessageHistoryResponse } from "../chat-room-contracts";
import { chatRoomQueryKeys, DEFAULT_MESSAGE_HISTORY_LIMIT } from "../chat-room-queries";
import {
  ChatMessageRecoveryError,
  recoverChatMessageHistory,
  type ChatMessageHistoryData,
} from "./chat-message-recovery";

describe("recoverChatMessageHistory", () => {
  it("cache가 watermark까지 연속이면 REST 복구를 생략한다", async () => {
    const queryClient = new QueryClient();
    const getRoomMessages = vi.fn();
    seedMessageHistory(queryClient, [createMessage(2), createMessage(3)]);

    const result = await recoverChatMessageHistory(queryClient, {
      api: { getRoomMessages },
      messageVisibleAfterSequence: 0,
      roomId: "room-01",
      throughSequence: 3,
    });

    expect(result).toEqual({
      fromSequence: 3,
      recoveredMessageCount: 0,
      requestCount: 0,
      throughSequence: 3,
    });
    expect(getRoomMessages).not.toHaveBeenCalled();
  });

  it("nextAfterSequence를 따라 watermark까지 여러 페이지를 복구한다", async () => {
    const queryClient = new QueryClient();
    const getRoomMessages = vi
      .fn()
      .mockResolvedValueOnce(createAfterResponse([createMessage(2), createMessage(3)], 3))
      .mockResolvedValueOnce(createAfterResponse([createMessage(4)], null));
    seedMessageHistory(queryClient, [createMessage(1)], 2);

    const result = await recoverChatMessageHistory(queryClient, {
      api: { getRoomMessages },
      limit: 2,
      messageVisibleAfterSequence: 0,
      roomId: "room-01",
      throughSequence: 4,
    });

    expect(getRoomMessages).toHaveBeenNthCalledWith(1, "room-01", {
      mode: "after",
      afterSequence: 1,
      limit: 2,
    });
    expect(getRoomMessages).toHaveBeenNthCalledWith(2, "room-01", {
      mode: "after",
      afterSequence: 3,
      limit: 2,
    });
    expect(getCachedSequences(queryClient, 2)).toEqual([1, 2, 3, 4]);
    expect(result).toEqual({
      fromSequence: 1,
      recoveredMessageCount: 3,
      requestCount: 2,
      throughSequence: 4,
    });
  });

  it("실시간 cache에 먼저 들어온 메시지 사이의 누락 구간만 채운다", async () => {
    const queryClient = new QueryClient();
    const getRoomMessages = vi
      .fn()
      .mockResolvedValue(createAfterResponse([createMessage(2), createMessage(3)], 3));
    seedMessageHistory(queryClient, [createMessage(1), createMessage(4)]);

    await recoverChatMessageHistory(queryClient, {
      api: { getRoomMessages },
      messageVisibleAfterSequence: 0,
      roomId: "room-01",
      throughSequence: 4,
    });

    expect(getRoomMessages).toHaveBeenCalledTimes(1);
    expect(getCachedSequences(queryClient)).toEqual([1, 2, 3, 4]);
  });

  it("서버 응답이 목표 sequence 전에 끝나면 cache를 변경하지 않는다", async () => {
    const queryClient = new QueryClient();
    const getRoomMessages = vi
      .fn()
      .mockResolvedValue(createAfterResponse([createMessage(2)], null));
    seedMessageHistory(queryClient, [createMessage(1)]);

    await expect(
      recoverChatMessageHistory(queryClient, {
        api: { getRoomMessages },
        messageVisibleAfterSequence: 0,
        roomId: "room-01",
        throughSequence: 3,
      }),
    ).rejects.toMatchObject({
      code: "MESSAGE_RECOVERY_INCOMPLETE",
    } satisfies Partial<ChatMessageRecoveryError>);
    expect(getCachedSequences(queryClient)).toEqual([1]);
  });

  it("cursor가 진행되지 않는 응답은 무한 재시도하지 않는다", async () => {
    const queryClient = new QueryClient();
    const getRoomMessages = vi.fn().mockResolvedValue(createAfterResponse([], 1));
    seedMessageHistory(queryClient, [createMessage(1)]);

    await expect(
      recoverChatMessageHistory(queryClient, {
        api: { getRoomMessages },
        messageVisibleAfterSequence: 0,
        roomId: "room-01",
        throughSequence: 2,
      }),
    ).rejects.toMatchObject({
      code: "MESSAGE_RECOVERY_STALLED",
    } satisfies Partial<ChatMessageRecoveryError>);
    expect(getRoomMessages).toHaveBeenCalledTimes(1);
  });

  it("보이는 메시지가 없으면 참여 경계부터 복구를 시작한다", async () => {
    const queryClient = new QueryClient();
    const getRoomMessages = vi
      .fn()
      .mockResolvedValue(createAfterResponse([createMessage(101), createMessage(102)], null));
    seedMessageHistory(queryClient, []);

    const result = await recoverChatMessageHistory(queryClient, {
      api: { getRoomMessages },
      messageVisibleAfterSequence: 100,
      roomId: "room-01",
      throughSequence: 102,
    });

    expect(getRoomMessages).toHaveBeenCalledWith("room-01", {
      mode: "after",
      afterSequence: 100,
      limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
    });
    expect(getCachedSequences(queryClient)).toEqual([101, 102]);
    expect(result).toMatchObject({
      fromSequence: 100,
      throughSequence: 102,
    });
  });

  it("최근 snapshot의 시작 sequence를 참여 경계 누락으로 오인하지 않는다", async () => {
    const queryClient = new QueryClient();
    const getRoomMessages = vi.fn();
    seedMessageHistory(queryClient, [createMessage(119), createMessage(120)]);

    const result = await recoverChatMessageHistory(queryClient, {
      api: { getRoomMessages },
      messageVisibleAfterSequence: 100,
      roomId: "room-01",
      throughSequence: 120,
    });

    expect(getRoomMessages).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      fromSequence: 120,
      throughSequence: 120,
    });
  });
});

function seedMessageHistory(
  queryClient: QueryClient,
  messages: readonly ChatMessage[],
  limit = DEFAULT_MESSAGE_HISTORY_LIMIT,
): void {
  const history: ChatMessageHistoryData = {
    pages: [
      {
        items: [...messages],
        nextBeforeSequence: null,
        nextAfterSequence: null,
        hasMore: false,
      },
    ],
    pageParams: [null],
  };

  queryClient.setQueryData(chatRoomQueryKeys.messageHistory("room-01", limit), history);
}

function getCachedSequences(
  queryClient: QueryClient,
  limit = DEFAULT_MESSAGE_HISTORY_LIMIT,
): readonly number[] {
  const history = queryClient.getQueryData<InfiniteData<MessageHistoryResponse, number | null>>(
    chatRoomQueryKeys.messageHistory("room-01", limit),
  );

  return history?.pages.flatMap((page) => page.items.map((message) => message.roomSequence)) ?? [];
}

function createAfterResponse(
  items: readonly ChatMessage[],
  nextAfterSequence: number | null,
): MessageHistoryResponse {
  return {
    items: [...items],
    nextBeforeSequence: null,
    nextAfterSequence,
    hasMore: nextAfterSequence !== null,
  };
}

function createMessage(roomSequence: number): ChatMessage {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    countable: true,
    senderUserId: "local-user-1",
    clientMessageId: `00000000-0000-4000-8000-${roomSequence.toString().padStart(12, "0")}`,
    content: `메시지 ${roomSequence}`,
    createdAt: "2026-07-30T00:00:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE",
    updatedAt: "2026-07-30T00:00:00Z",
  };
}
