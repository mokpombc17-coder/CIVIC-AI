import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { RoomReadReceiptStateResponse } from "../chat-room-contracts";
import { chatRoomQueryKeys } from "../chat-room-queries";
import {
  normalizeRoomReadReceiptState,
  type ChatRoomReadReceiptState,
} from "../chat-room-read-receipt-state";
import type { ChatRealtimeEventDelivery } from "./chat-realtime-event-buffer";
import {
  ChatRoomReadReceiptCoordinator,
  ChatRoomReadReceiptCoordinatorError,
} from "./chat-room-read-receipt-coordinator";

describe("ChatRoomReadReceiptCoordinator", () => {
  it("같은 generation의 병렬 REST query cache가 있으면 중복 요청 없이 ready로 시작한다", () => {
    const api = {
      getRoomReadReceiptState: vi.fn(),
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      receiptQueryKey(),
      normalizeRoomReadReceiptState(createReceiptState({ cursor: 10 })),
    );
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();

    expect(coordinator.getSnapshot().status).toBe("ready");
    expect(api.getRoomReadReceiptState).not.toHaveBeenCalled();
  });

  it("초기 snapshot 요청 중 도착한 delta를 snapshot 위에 병합한다", async () => {
    const initialSnapshot = createDeferred<RoomReadReceiptStateResponse>();
    const api = {
      getRoomReadReceiptState: vi.fn(() => initialSnapshot.promise),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    expect(coordinator.getSnapshot().status).toBe("loading");
    expect(coordinator.handleDelivery(createAdvanceDelivery(20))).toBe(1);

    initialSnapshot.resolve(createReceiptState({ cursor: 10 }));
    await flushMicrotasks();

    expect(coordinator.getSnapshot()).toMatchObject({ status: "ready", error: null });
    expect(getReceiptState(queryClient).positionsByMembershipId["membership-b"]).toMatchObject({
      membershipVersion: 1,
      storedLastReadSequence: 20,
    });
    expect(api.getRoomReadReceiptState).toHaveBeenCalledOnce();
  });

  it("같은 membership version은 cursor 최댓값만 반영하고 낮은 version은 무시한다", async () => {
    const api = {
      getRoomReadReceiptState: vi.fn(async () => createReceiptState({ cursor: 10, version: 2 })),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    await flushMicrotasks();
    coordinator.handleDelivery(createAdvanceDelivery(100, 1));
    coordinator.handleDelivery(createAdvanceDelivery(15, 2));
    coordinator.handleDelivery(createAdvanceDelivery(12, 2));

    expect(getReceiptState(queryClient).positionsByMembershipId["membership-b"]).toMatchObject({
      membershipVersion: 2,
      storedLastReadSequence: 15,
    });
    expect(api.getRoomReadReceiptState).toHaveBeenCalledOnce();
  });

  it("더 높은 membership version은 authoritative snapshot을 다시 받은 뒤 pending cursor를 합친다", async () => {
    const api = {
      getRoomReadReceiptState: vi
        .fn()
        .mockResolvedValueOnce(createReceiptState({ cursor: 10, version: 1 }))
        .mockResolvedValueOnce(createReceiptState({ cursor: 30, version: 2 })),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    await flushMicrotasks();
    coordinator.handleDelivery(createAdvanceDelivery(35, 2));
    expect(coordinator.getSnapshot().status).toBe("refreshing");
    await flushMicrotasks();

    expect(coordinator.getSnapshot().status).toBe("ready");
    expect(getReceiptState(queryClient).positionsByMembershipId["membership-b"]).toMatchObject({
      membershipVersion: 2,
      storedLastReadSequence: 35,
    });
    expect(api.getRoomReadReceiptState).toHaveBeenCalledTimes(2);
  });

  it("snapshot에 없는 membership delta도 participant snapshot을 다시 받아 병합한다", async () => {
    const api = {
      getRoomReadReceiptState: vi
        .fn()
        .mockResolvedValueOnce(createReceiptState({ cursor: 10 }))
        .mockResolvedValueOnce(createReceiptState({ cursor: 10, extraMembership: true })),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    await flushMicrotasks();
    coordinator.handleDelivery(createAdvanceDelivery(15, 1, "membership-c"));
    await flushMicrotasks();

    expect(coordinator.getSnapshot().status).toBe("ready");
    expect(
      getReceiptState(queryClient).positionsByMembershipId["membership-c"]?.storedLastReadSequence,
    ).toBe(15);
    expect(api.getRoomReadReceiptState).toHaveBeenCalledTimes(2);
  });

  it("invalidation 이후 delta는 새 snapshot 위에 병합한다", async () => {
    const refreshedSnapshot = createDeferred<RoomReadReceiptStateResponse>();
    const api = {
      getRoomReadReceiptState: vi
        .fn()
        .mockResolvedValueOnce(createReceiptState({ cursor: 10 }))
        .mockReturnValueOnce(refreshedSnapshot.promise),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    await flushMicrotasks();
    coordinator.handleDelivery(createInvalidationDelivery());
    coordinator.handleDelivery(createAdvanceDelivery(30));
    expect(coordinator.getSnapshot().status).toBe("refreshing");

    refreshedSnapshot.resolve(createReceiptState({ cursor: 20 }));
    await flushMicrotasks();

    expect(coordinator.getSnapshot().status).toBe("ready");
    expect(
      getReceiptState(queryClient).positionsByMembershipId["membership-b"]?.storedLastReadSequence,
    ).toBe(30);
  });

  it("snapshot 요청 중 invalidation이 오면 이전 응답을 버리고 trailing snapshot 하나를 적용한다", async () => {
    const staleSnapshot = createDeferred<RoomReadReceiptStateResponse>();
    const api = {
      getRoomReadReceiptState: vi
        .fn()
        .mockReturnValueOnce(staleSnapshot.promise)
        .mockResolvedValueOnce(createReceiptState({ cursor: 40 })),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    coordinator.handleDelivery(createInvalidationDelivery());
    staleSnapshot.resolve(createReceiptState({ cursor: 10 }));
    await flushMicrotasks(10);

    expect(api.getRoomReadReceiptState).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot().status).toBe("ready");
    expect(
      getReceiptState(queryClient).positionsByMembershipId["membership-b"]?.storedLastReadSequence,
    ).toBe(40);
  });

  it("malformed Receipt count는 core 오류와 분리해 Receipt snapshot만 갱신한다", async () => {
    const api = {
      getRoomReadReceiptState: vi
        .fn()
        .mockResolvedValueOnce(createReceiptState({ cursor: 10 }))
        .mockResolvedValueOnce(createReceiptState({ cursor: 25 })),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    await flushMicrotasks();
    expect(
      coordinator.handleDelivery(createDelivery({ events: [], invalidReadReceiptEventCount: 1 })),
    ).toBe(0);
    await flushMicrotasks();

    expect(coordinator.getSnapshot().status).toBe("ready");
    expect(api.getRoomReadReceiptState).toHaveBeenCalledTimes(2);
    expect(
      getReceiptState(queryClient).positionsByMembershipId["membership-b"]?.storedLastReadSequence,
    ).toBe(25);
  });

  it("topology 변화는 refetch하고 ROOM_CLOSED는 terminal로 정리한다", async () => {
    const api = {
      getRoomReadReceiptState: vi
        .fn()
        .mockResolvedValueOnce(createReceiptState({ cursor: 10 }))
        .mockResolvedValueOnce(
          createReceiptState({
            cursor: 10,
            extraMembership: true,
          }),
        ),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    await flushMicrotasks();
    coordinator.handleDelivery(createRoomEventDelivery("ROOM_MEMBER_JOINED"));
    await flushMicrotasks();

    expect(api.getRoomReadReceiptState).toHaveBeenCalledTimes(2);
    expect(getReceiptState(queryClient).positionsByMembershipId["membership-c"]).toBeDefined();

    coordinator.handleDelivery(createRoomEventDelivery("ROOM_CLOSED"));

    expect(coordinator.getSnapshot().status).toBe("terminal");
    expect(queryClient.getQueryData(receiptQueryKey())).toBeUndefined();
  });

  it("복구 snapshot이 높은 version을 따라잡지 못하면 제한 후 error로 전환한다", async () => {
    const errorListener = vi.fn();
    const api = {
      getRoomReadReceiptState: vi.fn(async () => createReceiptState({ cursor: 10, version: 1 })),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      maxRecoveryAttempts: 2,
      onError: errorListener,
      roomId: "room-01",
    });

    coordinator.start();
    await flushMicrotasks();
    coordinator.handleDelivery(createAdvanceDelivery(30, 2));
    await flushMicrotasks(12);

    expect(coordinator.getSnapshot()).toMatchObject({
      status: "error",
      error: expect.any(ChatRoomReadReceiptCoordinatorError),
    });
    expect(api.getRoomReadReceiptState).toHaveBeenCalledTimes(4);
    expect(errorListener).toHaveBeenCalledOnce();
  });

  it("stop 이후 이전 generation의 지연 snapshot을 cache에 남기지 않는다", async () => {
    const initialSnapshot = createDeferred<RoomReadReceiptStateResponse>();
    const api = {
      getRoomReadReceiptState: vi.fn(() => initialSnapshot.promise),
    };
    const queryClient = new QueryClient();
    const coordinator = new ChatRoomReadReceiptCoordinator(queryClient, {
      api,
      generation: 1,
      roomId: "room-01",
    });

    coordinator.start();
    coordinator.stop();
    initialSnapshot.resolve(createReceiptState({ cursor: 10 }));
    await flushMicrotasks();

    expect(coordinator.getSnapshot().status).toBe("idle");
    expect(queryClient.getQueryData(receiptQueryKey())).toBeUndefined();
  });
});

function createReceiptState({
  cursor,
  extraMembership = false,
  version = 1,
}: {
  cursor: number;
  extraMembership?: boolean;
  version?: number;
}): RoomReadReceiptStateResponse {
  return {
    roomId: "room-01",
    roomVersion: 2,
    selfMembershipId: "membership-a",
    positions: [
      {
        membershipId: "membership-a",
        membershipVersion: 1,
        messageVisibleAfterSequence: 0,
        storedLastReadSequence: 20,
      },
      {
        membershipId: "membership-b",
        membershipVersion: version,
        messageVisibleAfterSequence: 0,
        storedLastReadSequence: cursor,
      },
      ...(extraMembership
        ? [
            {
              membershipId: "membership-c",
              membershipVersion: 1,
              messageVisibleAfterSequence: 5,
              storedLastReadSequence: 5,
            },
          ]
        : []),
    ],
    generatedAt: "2026-08-10T03:00:00Z",
  };
}

function createAdvanceDelivery(
  storedLastReadSequence: number,
  membershipVersion = 1,
  membershipId = "membership-b",
): ChatRealtimeEventDelivery {
  return createDelivery({
    events: [
      {
        bufferSequence: 1,
        kind: "read-receipt",
        event: {
          eventVersion: 1,
          eventId: "550e8400-e29b-41d4-a716-446655440001",
          eventType: "ROOM_READ_POSITIONS_ADVANCED",
          emittedAt: "2026-08-10T03:00:01Z",
          payload: {
            roomId: "room-01",
            updates: [
              {
                membershipId,
                membershipVersion,
                storedLastReadSequence,
              },
            ],
          },
        },
      },
    ],
  });
}

function createInvalidationDelivery(): ChatRealtimeEventDelivery {
  return createDelivery({
    events: [
      {
        bufferSequence: 1,
        kind: "read-receipt",
        event: {
          eventVersion: 1,
          eventId: "550e8400-e29b-41d4-a716-446655440002",
          eventType: "ROOM_READ_RECEIPT_STATE_INVALIDATED",
          emittedAt: "2026-08-10T03:00:02Z",
          payload: {
            roomId: "room-01",
            cause: "DELTA_GAP_POSSIBLE",
          },
        },
      },
    ],
  });
}

function createRoomEventDelivery(
  eventType: "ROOM_MEMBER_JOINED" | "ROOM_CLOSED",
): ChatRealtimeEventDelivery {
  const event =
    eventType === "ROOM_MEMBER_JOINED"
      ? {
          eventVersion: 2 as const,
          eventId: "550e8400-e29b-41d4-a716-446655440003",
          eventType,
          emittedAt: "2026-08-10T03:00:03Z",
          payload: {
            roomId: "room-01",
            roomVersion: 3,
            roomStatus: "ACTIVE" as const,
            member: {
              membershipId: "membership-c",
              role: "MEMBER" as const,
              status: "ACTIVE" as const,
              membershipVersion: 1,
            },
          },
        }
      : {
          eventVersion: 2 as const,
          eventId: "550e8400-e29b-41d4-a716-446655440004",
          eventType,
          emittedAt: "2026-08-10T03:00:04Z",
          payload: {
            roomId: "room-01",
            roomVersion: 4,
            roomStatus: "CLOSED" as const,
            owner: {
              membershipId: "membership-a",
              role: "OWNER" as const,
              status: "ACTIVE" as const,
              membershipVersion: 1,
            },
          },
        };

  return createDelivery({
    events: [
      {
        bufferSequence: 1,
        kind: "room",
        event,
      },
    ],
  });
}

function createDelivery({
  events,
  invalidReadReceiptEventCount = 0,
}: {
  events: ChatRealtimeEventDelivery["events"];
  invalidReadReceiptEventCount?: number;
}): ChatRealtimeEventDelivery {
  return {
    deliveryId: "delivery-01",
    roomId: "room-01",
    generation: 1,
    events,
    throughBufferSequence: events.at(-1)?.bufferSequence ?? 0,
    overflowed: false,
    invalidEventCount: 0,
    invalidReadReceiptEventCount,
  };
}

function getReceiptState(queryClient: QueryClient): ChatRoomReadReceiptState {
  return queryClient.getQueryData<ChatRoomReadReceiptState>(receiptQueryKey())!;
}

function receiptQueryKey() {
  return chatRoomQueryKeys.readReceiptState("room-01", 1);
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks(count = 6): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}
