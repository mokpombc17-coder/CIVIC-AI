import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { chatRoomQueryKeys, DEFAULT_MESSAGE_HISTORY_LIMIT } from "../chat-room-queries";
import type { ChatMessage, MessageHistoryResponse, RoomDetails } from "../chat-room-contracts";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import {
  applyChatRealtimeEventDelivery,
  ChatRealtimeQueryCoordinator,
  ChatRealtimeQueryCoordinatorError,
  type ChatRealtimeQueryCoordinatorTransport,
  type ChatRoomEventJournal,
} from "./chat-realtime-query-coordinator";

describe("ChatRealtimeQueryCoordinator", () => {
  it("REST snapshot이 cache에 있어야 Worker에 적용 완료를 알린다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const onSynchronized = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      onSynchronized,
    });
    coordinator.start();

    expect(() => coordinator.notifyRoomSnapshotApplied()).toThrowError(
      ChatRealtimeQueryCoordinatorError,
    );
    expect(transport.markedSnapshots).toEqual([]);

    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    coordinator.notifyRoomSnapshotApplied();

    expect(transport.markedSnapshots).toEqual([
      {
        roomId: "room-01",
        generation: 1,
      },
    ]);
    expect(onSynchronized).toHaveBeenCalledOnce();
  });

  it("빈 snapshot의 참여 경계가 watermark와 같으면 복구 없이 동기화한다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const getRoomMessages = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      api: { getRoomMessages },
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 100,
    });
    seedMessageHistory(queryClient, "room-01", [[]]);
    coordinator.start();

    coordinator.notifyRoomSnapshotApplied();

    expect(getRoomMessages).not.toHaveBeenCalled();
    expect(transport.markedSnapshots).toEqual([
      {
        roomId: "room-01",
        generation: 1,
      },
    ]);
  });

  it("cache가 READY watermark보다 뒤처지면 afterSequence 복구 후 적용 완료를 알린다", async () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const getRoomMessages = vi
      .fn()
      .mockResolvedValue(createAfterResponse([createMessage(2), createMessage(3)]));
    const onRecovered = vi.fn();
    const onRecoveryStarted = vi.fn();
    const onSynchronized = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      api: { getRoomMessages },
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      watermarkSequence: 3,
      onRecoveryStarted,
      onRecovered,
      onSynchronized,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    coordinator.start();

    coordinator.notifyRoomSnapshotApplied();

    expect(transport.markedSnapshots).toEqual([]);
    expect(onRecoveryStarted).toHaveBeenCalledWith(3);
    await vi.waitFor(() => {
      expect(transport.markedSnapshots).toEqual([
        {
          roomId: "room-01",
          generation: 1,
        },
      ]);
    });
    expect(getRoomMessages).toHaveBeenCalledWith("room-01", {
      mode: "after",
      afterSequence: 1,
      limit: DEFAULT_MESSAGE_HISTORY_LIMIT,
    });
    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([
      createMessage(1),
      createMessage(2),
      createMessage(3),
    ]);
    expect(onRecovered).toHaveBeenCalledWith(
      expect.objectContaining({
        fromSequence: 1,
        throughSequence: 3,
      }),
    );
    expect(onSynchronized).toHaveBeenCalledOnce();
  });

  it("재연결에서는 로드된 모든 REST page snapshot을 갱신한 뒤 적용 완료를 알린다", async () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const updatedMessage4 = {
      ...createMessage(4),
      content: "재연결 중 수정된 메시지",
      messageVersion: 2,
      updatedAt: "2026-07-29T04:41:00Z",
    } satisfies ChatMessage;
    const deletedAt = "2026-07-29T04:42:00Z";
    const deletedMessage2 = {
      ...createMessage(2),
      content: null,
      deletedAt,
      messageVersion: 2,
      state: "DELETED_BY_AUTHOR",
      updatedAt: deletedAt,
    } satisfies ChatMessage;
    const getRoomMessages = vi
      .fn()
      .mockResolvedValueOnce(createAfterResponse([updatedMessage4]))
      .mockResolvedValueOnce(createAfterResponse([deletedMessage2]));
    const onSnapshotRefreshStarted = vi.fn();
    const onSnapshotRefreshed = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      api: { getRoomMessages },
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      watermarkSequence: 4,
      refreshLoadedPagesBeforeSnapshot: true,
      onSnapshotRefreshStarted,
      onSnapshotRefreshed,
    });
    seedMessageHistory(queryClient, "room-01", [
      [createMessage(3), createMessage(4)],
      [createMessage(1), createMessage(2)],
    ]);
    coordinator.start();

    coordinator.notifyRoomSnapshotApplied();

    expect(transport.markedSnapshots).toEqual([]);
    expect(onSnapshotRefreshStarted).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(transport.markedSnapshots).toEqual([
        {
          roomId: "room-01",
          generation: 1,
        },
      ]);
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
    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items[1]).toEqual(updatedMessage4);
    expect(getMessageHistory(queryClient, "room-01").pages[1]?.items[1]).toEqual(deletedMessage2);
    expect(onSnapshotRefreshed).toHaveBeenCalledWith({
      pageCount: 2,
      refreshedMessageCount: 2,
    });
  });

  it("복구 중 coordinator가 중지되면 완료된 요청이 이전 session을 활성화하지 않는다", async () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    let resolveResponse!: (response: MessageHistoryResponse) => void;
    const getRoomMessages = vi.fn(
      () =>
        new Promise<MessageHistoryResponse>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const onRecovered = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      api: { getRoomMessages },
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      watermarkSequence: 2,
      onRecovered,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    coordinator.start();

    coordinator.notifyRoomSnapshotApplied();
    coordinator.stop();
    resolveResponse(createAfterResponse([createMessage(2)]));

    await vi.waitFor(() => {
      expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([
        createMessage(1),
        createMessage(2),
      ]);
    });
    expect(transport.markedSnapshots).toEqual([]);
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it("delivery에서 sequence 누락을 발견하면 자동 복구 후 같은 delivery를 ACK한다", async () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const getRoomMessages = vi
      .fn()
      .mockResolvedValue(createAfterResponse([createMessage(2), createMessage(3)]));
    const onError = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      api: { getRoomMessages },
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      onError,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-gap",
        events: [createBufferedMessage(3, 1)],
      }),
    );

    expect(transport.acknowledgedDeliveries).toEqual([]);
    await vi.waitFor(() => {
      expect(transport.acknowledgedDeliveries).toEqual(["delivery-gap"]);
    });
    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([
      createMessage(1),
      createMessage(2),
      createMessage(3),
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("메시지와 Room Event를 모두 cache에 반영한 뒤 delivery를 ACK한다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const onApplied = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      onApplied,
    });
    seedMessageHistory(queryClient, "room-01", [
      [createMessage(3), createMessage(4)],
      [createMessage(1), createMessage(2)],
    ]);

    coordinator.start();
    transport.emit(
      createDelivery({
        deliveryId: "delivery-1",
        events: [createBufferedMessage(5, 1), createBufferedRoomEvent("event-1", 2)],
      }),
    );

    const history = getMessageHistory(queryClient, "room-01");
    const journal = queryClient.getQueryData<ChatRoomEventJournal>(
      chatRoomQueryKeys.roomEventJournal("room-01"),
    );

    expect(history.pages[0]?.items.map((message) => message.roomSequence)).toEqual([3, 4, 5]);
    expect(history.pages[1]?.items.map((message) => message.roomSequence)).toEqual([1, 2]);
    expect(history.pageParams).toEqual([null, 3]);
    expect(journal?.events.map((event) => event.eventId)).toEqual(["event-1"]);
    expect(transport.acknowledgedDeliveries).toEqual(["delivery-1"]);
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: "delivery-1",
        messageCount: 1,
        roomEventCount: 1,
      }),
    );
  });

  it("로드된 메시지의 UPDATE/DELETE snapshot을 기존 page 위치에서 version 순으로 병합한다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
    });
    seedMessageHistory(queryClient, "room-01", [
      [createMessage(3), createMessage(4)],
      [createMessage(1), createMessage(2)],
    ]);
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-mutations",
        events: [
          createBufferedUpdatedMessage(2, 2, 1, "수정된 과거 메시지"),
          createBufferedDeletedMessage(4, 3, 2),
          createBufferedUpdatedMessage(2, 1, 3, "뒤늦게 도착한 이전 snapshot"),
        ],
      }),
    );

    const history = getMessageHistory(queryClient, "room-01");

    expect(history.pages[0]?.items.map((message) => message.roomSequence)).toEqual([3, 4]);
    expect(history.pages[0]?.items[1]).toMatchObject({
      content: null,
      messageId: "message-4",
      messageVersion: 3,
      state: "DELETED_BY_AUTHOR",
    });
    expect(history.pages[1]?.items.map((message) => message.roomSequence)).toEqual([1, 2]);
    expect(history.pages[1]?.items[1]).toMatchObject({
      content: "수정된 과거 메시지",
      messageId: "message-2",
      messageVersion: 2,
      state: "ACTIVE",
    });
    expect(transport.acknowledgedDeliveries).toEqual(["delivery-mutations"]);
  });

  it("현재 로드되지 않은 메시지의 UPDATE/DELETE event는 목록에 삽입하지 않는다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(10), createMessage(11)]]);
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-unloaded-mutations",
        events: [
          createBufferedUpdatedMessage(2, 2, 1, "로드되지 않은 수정"),
          createBufferedDeletedMessage(3, 2, 2),
        ],
      }),
    );

    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([
      createMessage(10),
      createMessage(11),
    ]);
    expect(transport.acknowledgedDeliveries).toEqual(["delivery-unloaded-mutations"]);
  });

  it("같은 delivery에 CREATE가 있으면 뒤따른 최신 UPDATE snapshot까지 새 메시지로 적용한다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-create-update",
        events: [
          createBufferedMessage(2, 1),
          createBufferedUpdatedMessage(2, 2, 2, "생성 직후 수정"),
        ],
      }),
    );

    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([
      createMessage(1),
      expect.objectContaining({
        content: "생성 직후 수정",
        messageId: "message-2",
        messageVersion: 2,
      }),
    ]);
    expect(transport.acknowledgedDeliveries).toEqual(["delivery-create-update"]);
  });

  it("참여 경계 이하의 buffered message는 폐기하고 Room Event는 계속 적용한다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const onApplied = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 100,
      onApplied,
    });
    seedMessageHistory(queryClient, "room-01", [[]]);
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-boundary",
        events: [
          createBufferedMessage(99, 1),
          createBufferedMessage(100, 2),
          createBufferedMessage(101, 3),
          createBufferedRoomEvent("event-boundary", 4),
        ],
      }),
    );

    expect(
      getMessageHistory(queryClient, "room-01").pages[0]?.items.map(
        (message) => message.roomSequence,
      ),
    ).toEqual([101]);
    expect(
      queryClient
        .getQueryData<ChatRoomEventJournal>(chatRoomQueryKeys.roomEventJournal("room-01"))
        ?.events.map((event) => event.eventId),
    ).toEqual(["event-boundary"]);
    expect(transport.acknowledgedDeliveries).toEqual(["delivery-boundary"]);
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        messageCount: 1,
        roomEventCount: 1,
      }),
    );
  });

  it("재전달된 메시지와 Room Event는 중복 저장하지 않고 다시 ACK할 수 있다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
    });
    const firstDelivery = createDelivery({
      deliveryId: "delivery-1",
      events: [createBufferedMessage(2, 1), createBufferedRoomEvent("event-1", 2)],
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    queryClient.setQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01"), {
      roomId: "room-01",
      name: "테스트 방",
      description: "",
      ownerUserId: "local-owner",
      status: "ACTIVE",
      visibility: "LISTED",
      joinPolicy: "OPEN",
      activeMemberCount: 1,
      createdAt: "2026-07-30T00:00:00Z",
      closedAt: null,
      version: 1,
      participationStatus: "NOT_JOINED",
      myMembership: null,
    });
    coordinator.start();

    transport.emit(firstDelivery);
    transport.emit({
      ...firstDelivery,
      deliveryId: "delivery-2",
    });

    expect(
      getMessageHistory(queryClient, "room-01").pages[0]?.items.map(
        (message) => message.roomSequence,
      ),
    ).toEqual([1, 2]);
    expect(
      queryClient.getQueryData<ChatRoomEventJournal>(chatRoomQueryKeys.roomEventJournal("room-01"))
        ?.events,
    ).toHaveLength(1);
    expect(
      queryClient.getQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01")),
    ).toMatchObject({
      activeMemberCount: 2,
      version: 2,
    });
    expect(transport.acknowledgedDeliveries).toEqual(["delivery-1", "delivery-2"]);
  });

  it("메시지 충돌이 발생하면 cache와 ACK를 변경하지 않고 오류를 보존한다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const onError = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      onError,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-conflict",
        events: [
          {
            bufferSequence: 1,
            kind: "message",
            event: {
              eventVersion: 1,
              eventType: "CHAT_MESSAGE_CREATED",
              payload: {
                ...createMessage(1),
                content: "충돌하는 내용",
              },
            },
          },
        ],
      }),
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(transport.acknowledgedDeliveries).toEqual([]);
    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([createMessage(1)]);
  });

  it("다른 방 또는 generation의 delivery는 소비하지 않는다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 2,
      messageVisibleAfterSequence: 0,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-stale",
        generation: 1,
        events: [createBufferedMessage(2, 1)],
      }),
    );

    expect(transport.acknowledgedDeliveries).toEqual([]);
    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([createMessage(1)]);
  });

  it("Room Event 충돌이 있으면 메시지 cache도 변경하지 않고 ACK를 보류한다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const onError = vi.fn();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      onError,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    queryClient.setQueryData<ChatRoomEventJournal>(chatRoomQueryKeys.roomEventJournal("room-01"), {
      roomId: "room-01",
      events: [createBufferedRoomEvent("event-1", 1).event],
    });
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-room-conflict",
        events: [createBufferedMessage(2, 1), createBufferedRoomEvent("event-1", 2, 3)],
      }),
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(transport.acknowledgedDeliveries).toEqual([]);
    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([createMessage(1)]);
  });
});

describe("applyChatRealtimeEventDelivery", () => {
  it("delivery에 sequence gap이 있으면 cache 적용을 보류한다", () => {
    const queryClient = new QueryClient();
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);

    expect(() =>
      applyChatRealtimeEventDelivery(
        queryClient,
        createDelivery({
          events: [createBufferedMessage(3, 1)],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "MESSAGE_SEQUENCE_GAP",
      }),
    );
    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([createMessage(1)]);
  });

  it("보이는 cache가 비어 있으면 참여 경계 다음 sequence부터 연속성을 검사한다", () => {
    const queryClient = new QueryClient();
    seedMessageHistory(queryClient, "room-01", [[]]);

    expect(() =>
      applyChatRealtimeEventDelivery(
        queryClient,
        createDelivery({
          events: [createBufferedMessage(103, 1)],
        }),
        DEFAULT_MESSAGE_HISTORY_LIMIT,
        100,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "MESSAGE_SEQUENCE_GAP",
      }),
    );
    expect(getMessageHistory(queryClient, "room-01").pages[0]?.items).toEqual([]);
  });

  it.each([
    {
      name: "overflow",
      delivery: createDelivery({ overflowed: true }),
      code: "BUFFER_OVERFLOW",
    },
    {
      name: "invalid event",
      delivery: createDelivery({ invalidEventCount: 1 }),
      code: "INVALID_REALTIME_EVENT",
    },
  ])("$name 복구 신호가 있으면 cache 적용을 시작하지 않는다", ({ delivery, code }) => {
    const queryClient = new QueryClient();
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);

    expect(() => applyChatRealtimeEventDelivery(queryClient, delivery)).toThrowError(
      expect.objectContaining({ code }),
    );
  });
});

type FakeTransport = ChatRealtimeQueryCoordinatorTransport & {
  acknowledgedDeliveries: string[];
  emit(delivery: ChatRealtimeEventDelivery): void;
  markedSnapshots: Array<{ roomId: string; generation: number }>;
};

function createFakeTransport(): FakeTransport {
  let delivery: ChatRealtimeEventDelivery | null = null;
  const listeners = new Set<() => void>();
  const acknowledgedDeliveries: string[] = [];
  const markedSnapshots: Array<{ roomId: string; generation: number }> = [];

  return {
    acknowledgedDeliveries,
    acknowledgeRealtimeEventDelivery(deliveryId) {
      acknowledgedDeliveries.push(deliveryId);

      if (delivery?.deliveryId === deliveryId) {
        delivery = null;
        listeners.forEach((listener) => listener());
      }
    },
    emit(nextDelivery) {
      delivery = nextDelivery;
      listeners.forEach((listener) => listener());
    },
    getRealtimeEventDelivery() {
      return delivery;
    },
    markedSnapshots,
    markRoomSnapshotApplied(roomId, generation) {
      markedSnapshots.push({ roomId, generation });
    },
    observeRealtimeEventDelivery(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function seedMessageHistory(
  queryClient: QueryClient,
  roomId: string,
  pages: readonly (readonly ChatMessage[])[],
): void {
  const history: InfiniteData<MessageHistoryResponse, number | null> = {
    pages: pages.map((items, index) => ({
      items: [...items],
      nextBeforeSequence: index < pages.length - 1 ? (items[0]?.roomSequence ?? null) : null,
      nextAfterSequence: null,
      hasMore: index < pages.length - 1,
    })),
    pageParams: pages.map((_, index) =>
      index === 0 ? null : (pages[index - 1]?.[0]?.roomSequence ?? null),
    ),
  };

  queryClient.setQueryData(
    chatRoomQueryKeys.messageHistory(roomId, DEFAULT_MESSAGE_HISTORY_LIMIT),
    history,
  );
}

function getMessageHistory(
  queryClient: QueryClient,
  roomId: string,
): InfiniteData<MessageHistoryResponse, number | null> {
  return queryClient.getQueryData(
    chatRoomQueryKeys.messageHistory(roomId, DEFAULT_MESSAGE_HISTORY_LIMIT),
  )!;
}

function createDelivery({
  deliveryId = "delivery-1",
  generation = 1,
  events = [],
  overflowed = false,
  invalidEventCount = 0,
}: {
  deliveryId?: string;
  generation?: number;
  events?: ChatRealtimeEventDelivery["events"];
  overflowed?: boolean;
  invalidEventCount?: number;
} = {}): ChatRealtimeEventDelivery {
  return {
    deliveryId,
    roomId: "room-01",
    generation,
    events,
    throughBufferSequence: events.at(-1)?.bufferSequence ?? 0,
    overflowed,
    invalidEventCount,
  };
}

function createBufferedMessage(
  roomSequence: number,
  bufferSequence: number,
): Extract<ChatRealtimeEventDelivery["events"][number], { kind: "message" }> {
  return {
    bufferSequence,
    kind: "message",
    event: {
      eventVersion: 1,
      eventType: "CHAT_MESSAGE_CREATED",
      payload: createMessage(roomSequence),
    },
  };
}

function createBufferedUpdatedMessage(
  roomSequence: number,
  messageVersion: number,
  bufferSequence: number,
  content: string,
): Extract<ChatRealtimeEventDelivery["events"][number], { kind: "message" }> {
  return {
    bufferSequence,
    kind: "message",
    event: {
      eventVersion: 1,
      eventType: "CHAT_MESSAGE_UPDATED",
      payload: {
        ...createMessage(roomSequence),
        content,
        messageVersion,
        updatedAt: `2026-07-29T04:${String(40 + messageVersion).padStart(2, "0")}:00Z`,
      },
    },
  };
}

function createBufferedDeletedMessage(
  roomSequence: number,
  messageVersion: number,
  bufferSequence: number,
): Extract<ChatRealtimeEventDelivery["events"][number], { kind: "message" }> {
  const deletedAt = `2026-07-29T04:${String(40 + messageVersion).padStart(2, "0")}:00Z`;

  return {
    bufferSequence,
    kind: "message",
    event: {
      eventVersion: 1,
      eventType: "CHAT_MESSAGE_DELETED",
      payload: {
        ...createMessage(roomSequence),
        content: null,
        deletedAt,
        messageVersion,
        state: "DELETED_BY_AUTHOR",
        updatedAt: deletedAt,
      },
    },
  };
}

function createBufferedRoomEvent(
  eventId: string,
  bufferSequence: number,
  roomVersion = 2,
): Extract<ChatRealtimeEventDelivery["events"][number], { kind: "room" }> {
  return {
    bufferSequence,
    kind: "room",
    event: {
      eventVersion: 1,
      eventId,
      eventType: "ROOM_MEMBER_JOINED",
      emittedAt: "2026-07-30T00:00:00Z",
      payload: {
        roomId: "room-01",
        roomVersion,
        roomStatus: "ACTIVE",
        member: {
          membershipId: "membership-01",
          userId: "local-user-1",
          role: "MEMBER",
          status: "ACTIVE",
          membershipVersion: 1,
        },
      },
    },
  };
}

function createMessage(roomSequence: number): Extract<ChatMessage, { state: "ACTIVE" }> {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    senderUserId: "local-user-1",
    clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    content: `message ${roomSequence}`,
    createdAt: "2026-07-30T00:00:00Z",
    deletedAt: null,
    messageVersion: 1,
    state: "ACTIVE",
    updatedAt: "2026-07-30T00:00:00Z",
  };
}

function createAfterResponse(items: readonly ChatMessage[]): MessageHistoryResponse {
  return {
    items: [...items],
    nextBeforeSequence: null,
    nextAfterSequence: null,
    hasMore: false,
  };
}
