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

  it("재전달된 메시지와 Room Event는 중복 저장하지 않고 다시 ACK할 수 있다", () => {
    const queryClient = new QueryClient();
    const transport = createFakeTransport();
    const coordinator = new ChatRealtimeQueryCoordinator(queryClient, transport, {
      roomId: "room-01",
      generation: 1,
    });
    const firstDelivery = createDelivery({
      deliveryId: "delivery-1",
      events: [createBufferedMessage(2, 1), createBufferedRoomEvent("event-1", 2)],
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    queryClient.setQueryData<RoomDetails>(chatRoomQueryKeys.detail("room-01"), {
      roomId: "room-01",
      name: "테스트 방",
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
      onError,
    });
    seedMessageHistory(queryClient, "room-01", [[createMessage(1)]]);
    coordinator.start();

    transport.emit(
      createDelivery({
        deliveryId: "delivery-conflict",
        events: [
          {
            ...createBufferedMessage(1, 1),
            event: {
              ...createBufferedMessage(1, 1).event,
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

function createMessage(roomSequence: number): ChatMessage {
  return {
    messageId: `message-${roomSequence}`,
    roomId: "room-01",
    roomSequence,
    senderUserId: "local-user-1",
    clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    content: `message ${roomSequence}`,
    createdAt: "2026-07-30T00:00:00Z",
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
