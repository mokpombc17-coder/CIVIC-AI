import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  createRoomMessageContextExtensionState,
  discardRoomMessageContextQueries,
  extendRoomMessageContextResponse,
  mergeRoomMessageContextWindow,
  reduceRoomMessageContextExtensionState,
} from "@/components/use-room-message-context";
import type {
  ChatMessage,
  MessageHistoryResponse,
  RoomMessageContextResponse,
} from "@/lib/chat/chat-room-contracts";
import { chatRoomQueryKeys } from "@/lib/chat/chat-room-queries";

describe("Room message context window", () => {
  it("이전·Context·이후 메시지를 sequence ASC로 중복 없이 병합한다", () => {
    const context = createContextResponse([
      createMessage(10),
      createMessage(11),
      createMessage(12),
    ]);
    const messages = mergeRoomMessageContextWindow(
      "room-01",
      context,
      [createMessage(8), createMessage(9), createMessage(10)],
      [createMessage(12), createMessage(13)],
    );

    expect(messages.map((message) => message.roomSequence)).toEqual([8, 9, 10, 11, 12, 13]);
    expect(messages.filter((message) => message.messageId === "message-10")).toHaveLength(1);
  });

  it("이전 continuation 성공 시 메시지와 exclusive cursor를 갱신한다", () => {
    const key = "context-key";
    const started = reduceRoomMessageContextExtensionState(
      createRoomMessageContextExtensionState(key),
      { type: "request-started", direction: "older", key },
    );
    const succeeded = reduceRoomMessageContextExtensionState(started, {
      type: "request-succeeded",
      direction: "older",
      key,
      response: createHistoryResponse([createMessage(8), createMessage(9)], {
        hasMore: true,
        nextBeforeSequence: 8,
      }),
    });

    expect(started.isLoadingOlder).toBe(true);
    expect(succeeded).toMatchObject({
      error: null,
      failedDirection: null,
      isLoadingOlder: false,
      nextBeforeSequence: 8,
    });
    expect(succeeded.olderMessages.map((message) => message.roomSequence)).toEqual([8, 9]);
  });

  it("continuation 메시지를 Context query snapshot에 합쳐 realtime 갱신 대상으로 유지한다", () => {
    const context = createContextResponse([createMessage(10), createMessage(11)]);
    const extended = extendRoomMessageContextResponse(
      "room-01",
      context,
      createHistoryResponse([createMessage(8), createMessage(9)], {
        hasMore: true,
        nextBeforeSequence: 8,
      }),
      "older",
    );

    expect(extended.items.map((message) => message.roomSequence)).toEqual([8, 9, 10, 11]);
    expect(extended).toMatchObject({ hasOlder: true, nextBeforeSequence: 8 });
  });

  it("continuation 실패 방향을 보존하고 다른 Context의 늦은 결과를 무시한다", () => {
    const key = "context-key";
    const error = new Error("이전 메시지 실패");
    const failed = reduceRoomMessageContextExtensionState(
      createRoomMessageContextExtensionState(key),
      { type: "request-failed", direction: "older", error, key },
    );
    const stale = reduceRoomMessageContextExtensionState(failed, {
      type: "request-succeeded",
      direction: "older",
      key: "stale-context-key",
      response: createHistoryResponse([createMessage(7)]),
    });

    expect(failed).toMatchObject({ error, failedDirection: "older", isLoadingOlder: false });
    expect(stale).toBe(failed);
  });

  it("Context를 닫으면 해당 Room의 generation별 query를 모두 제거한다", async () => {
    const queryClient = new QueryClient();
    const keyOne = chatRoomQueryKeys.messageContext("room-01", "message-10", 1, 20, 20);
    const keyTwo = chatRoomQueryKeys.messageContext("room-01", "message-20", 2, 20, 20);
    const otherRoomKey = chatRoomQueryKeys.messageContext("room-02", "message-10", 1, 20, 20);

    queryClient.setQueryData(keyOne, { value: 1 });
    queryClient.setQueryData(keyTwo, { value: 2 });
    queryClient.setQueryData(otherRoomKey, { value: 3 });

    await discardRoomMessageContextQueries(queryClient, "room-01");

    expect(queryClient.getQueryData(keyOne)).toBeUndefined();
    expect(queryClient.getQueryData(keyTwo)).toBeUndefined();
    expect(queryClient.getQueryData(otherRoomKey)).toEqual({ value: 3 });
  });
});

function createContextResponse(items: readonly ChatMessage[]): RoomMessageContextResponse {
  return {
    targetMessageId: "message-11",
    targetRoomSequence: 11,
    items: [...items],
    nextBeforeSequence: 10,
    nextAfterSequence: 12,
    hasOlder: true,
    hasNewer: true,
  };
}

function createHistoryResponse(
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
    senderMembershipId: "membership-01",
    clientMessageId: `00000000-0000-4000-8000-${String(roomSequence).padStart(12, "0")}`,
    content: `메시지 ${roomSequence}`,
    state: "ACTIVE",
    countable: true,
    messageVersion: 1,
    createdAt: "2026-08-11T00:00:00Z",
    updatedAt: "2026-08-11T00:00:00Z",
    deletedAt: null,
  };
}
