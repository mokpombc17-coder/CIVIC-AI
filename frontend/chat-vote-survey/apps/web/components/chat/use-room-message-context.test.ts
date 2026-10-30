import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createChatMessageRenderKey } from "@/components/chat/chat-room-view-model";
import {
  createRestoredRoomMessageNavigationSelection,
  createRoomMessageContextExtensionState,
  createRoomMessageNavigationTimelineKey,
  resolveRoomMessageNavigationLifecycle,
  discardRoomMessageContextQueries,
  extendRoomMessageContextResponse,
  findCachedRoomMessageContextTarget,
  mergeRoomMessageContextWindow,
  reduceRoomMessageContextExtensionState,
  resolveRoomMessageNavigationDestination,
  type RoomMessageNavigationSelection,
} from "@/components/chat/use-room-message-context";
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

  it("같은 Room generation의 다른 Context에 메시지가 있으면 중심 메시지를 재사용한다", () => {
    const queryClient = new QueryClient();
    const contextKey = chatRoomQueryKeys.messageContext("room-01", "message-11", 1, 20, 20);
    const staleKey = chatRoomQueryKeys.messageContext("room-01", "message-21", 0, 20, 20);

    queryClient.setQueryData(
      contextKey,
      createContextResponse([createMessage(10), createMessage(11), createMessage(12)]),
    );
    queryClient.setQueryData(staleKey, {
      ...createContextResponse([createMessage(20), createMessage(21), createMessage(22)]),
      targetMessageId: "message-21",
      targetRoomSequence: 21,
    });

    expect(
      findCachedRoomMessageContextTarget({
        generation: 1,
        messageId: "message-12",
        queryClient,
        roomId: "room-01",
      }),
    ).toBe("message-11");
    expect(
      findCachedRoomMessageContextTarget({
        generation: 1,
        messageId: "message-22",
        queryClient,
        roomId: "room-01",
      }),
    ).toBeNull();
  });

  it("live, 현재 Context, 캐시 Context, 원격 Context 순서로 이동 위치를 결정한다", () => {
    const queryClient = new QueryClient();
    const contextKey = chatRoomQueryKeys.messageContext("room-01", "message-11", 1, 20, 20);
    queryClient.setQueryData(
      contextKey,
      createContextResponse([createMessage(10), createMessage(11), createMessage(12)]),
    );
    const base = {
      generation: 1,
      messageId: "message-12",
      queryClient,
      roomId: "room-01",
    } as const;

    expect(
      resolveRoomMessageNavigationDestination({
        ...base,
        activeContextMessageId: "message-21",
        contextMessages: [createMessage(12)],
        liveMessages: [createMessage(12)],
      }),
    ).toEqual({ kind: "live" });
    expect(
      resolveRoomMessageNavigationDestination({
        ...base,
        activeContextMessageId: "message-21",
        contextMessages: [createMessage(12)],
        liveMessages: [],
      }),
    ).toEqual({ contextMessageId: "message-21", kind: "context", source: "current" });
    expect(
      resolveRoomMessageNavigationDestination({
        ...base,
        activeContextMessageId: null,
        contextMessages: [],
        liveMessages: [],
      }),
    ).toEqual({ contextMessageId: "message-11", kind: "context", source: "cache" });
    expect(
      resolveRoomMessageNavigationDestination({
        ...base,
        activeContextMessageId: null,
        contextMessages: [],
        liveMessages: [],
        messageId: "message-99",
      }),
    ).toEqual({ contextMessageId: "message-99", kind: "context", source: "remote" });
  });

  it("Room context lifecycle 종료 시 해당 Room의 generation별 query를 모두 제거한다", async () => {
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

describe("Room message navigation restore", () => {
  const contextSelection = {
    contextMessageId: "message-11",
    generation: 1,
    kind: "context",
    purpose: "search",
    restore: null,
    roomId: "room-01",
    searchSessionGeneration: 0,
    targetMessageId: "message-11",
  } as const satisfies RoomMessageNavigationSelection;
  const contextMessages = [createMessage(10), createMessage(11), createMessage(12)];

  it.each([
    {
      expected: "hold",
      input: { enabled: false, generation: 1, missedUpdates: false },
      label: "연결이 끊긴 동안에는 보던 대화를 그대로 둔다",
    },
    {
      expected: "keep",
      input: { enabled: true, generation: 1, missedUpdates: false },
      label: "끊긴 적 없이 같은 generation이면 그대로 둔다",
    },
    {
      expected: "restore",
      input: { enabled: true, generation: 1, missedUpdates: true },
      label: "같은 generation이어도 끊겼다 돌아오면 보던 위치 주변을 새로 받는다",
    },
    {
      expected: "restore",
      input: { enabled: true, generation: 2, missedUpdates: false },
      label: "generation이 바뀌면 보던 위치 주변을 새로 받는다",
    },
  ] as const)("$label", ({ expected, input }) => {
    expect(
      resolveRoomMessageNavigationLifecycle({
        ...input,
        roomId: "room-01",
        searchSessionGeneration: 0,
        selection: contextSelection,
      }),
    ).toBe(expected);
  });

  it("선택이 없거나 방이 바뀌면 이동 선택을 비운다", () => {
    const base = {
      enabled: true,
      generation: 1,
      missedUpdates: true,
      searchSessionGeneration: 0,
    };

    expect(
      resolveRoomMessageNavigationLifecycle({ ...base, roomId: "room-01", selection: null }),
    ).toBe("reset");
    expect(
      resolveRoomMessageNavigationLifecycle({
        ...base,
        roomId: "room-02",
        selection: contextSelection,
      }),
    ).toBe("reset");
  });

  it("재연결하면 끊기기 전 화면 맨 위 메시지 주변을 새 generation으로 다시 열고 원래 대상은 유지한다", () => {
    const anchor = {
      offsetFromViewportTop: -24,
      renderKey: createChatMessageRenderKey(createMessage(12).clientMessageId),
    };
    const restored = createRestoredRoomMessageNavigationSelection({
      anchor,
      contextMessages,
      generation: 2,
      restoreId: "restored-1",
      liveMessages: [createMessage(40)],
      selection: contextSelection,
    });

    expect(restored).toMatchObject({
      contextMessageId: "message-12",
      generation: 2,
      kind: "context",
      purpose: "search",
      restore: {
        anchor,
        carriedMessages: contextMessages,
        previousTimelineKey: "context:message-11",
      },
      targetMessageId: "message-11",
    });
    expect(createRoomMessageNavigationTimelineKey(restored)).toBe("context:message-11:restored-1");
  });

  it("보던 위치를 모르면 원래 이동 위치 주변을 다시 연다", () => {
    const restored = createRestoredRoomMessageNavigationSelection({
      anchor: { offsetFromViewportTop: 0, renderKey: "client-message-missing" },
      contextMessages,
      generation: 2,
      restoreId: "restored-1",
      liveMessages: [],
      selection: contextSelection,
    });

    expect(restored).toMatchObject({
      contextMessageId: "message-11",
      kind: "context",
      restore: { anchor: null },
    });
  });

  it("보던 메시지가 이미 실시간 목록에 있으면 실시간 목록에서 같은 위치로 돌아간다", () => {
    const anchor = {
      offsetFromViewportTop: 8,
      renderKey: createChatMessageRenderKey(createMessage(12).clientMessageId),
    };
    const restored = createRestoredRoomMessageNavigationSelection({
      anchor,
      contextMessages,
      generation: 2,
      restoreId: "restored-1",
      liveMessages: [createMessage(12), createMessage(13)],
      selection: contextSelection,
    });

    expect(restored).toMatchObject({
      kind: "live",
      restore: { anchor, carriedMessages: [] },
      targetMessageId: "message-11",
    });
  });

  it("실시간 목록 이동은 재연결 뒤에도 같은 timeline으로 이어 간다", () => {
    const liveSelection = {
      generation: 1,
      kind: "live",
      purpose: "search",
      restore: null,
      roomId: "room-01",
      searchSessionGeneration: 0,
      targetMessageId: "message-40",
    } as const satisfies RoomMessageNavigationSelection;
    const restored = createRestoredRoomMessageNavigationSelection({
      anchor: null,
      contextMessages: [],
      generation: 2,
      restoreId: "restored-1",
      liveMessages: [createMessage(40)],
      selection: liveSelection,
    });

    expect(restored).toEqual({ ...liveSelection, generation: 2 });
    expect(createRoomMessageNavigationTimelineKey(restored)).toBe(
      createRoomMessageNavigationTimelineKey(liveSelection),
    );
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
    senderParticipationId: "participation-fixture",
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
