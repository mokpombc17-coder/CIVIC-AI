import { describe, expect, it, vi } from "vitest";
import type {
  ChatConnectionStatus,
  ChatRealtimeTransport,
  ChatRoomSessionStatus,
} from "./chat-realtime-transport";
import {
  attachChatRealtimeRoomLifecycle,
  type ChatRealtimeRoomLifecycleTarget,
  type ChatRealtimeRoomVisibilityTarget,
} from "./chat-realtime-room-lifecycle";

describe("attachChatRealtimeRoomLifecycle", () => {
  it("mount에서 방을 claim하고 cleanup에서 같은 방을 release한다", () => {
    const transport = createFakeTransport();
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget();

    const cleanup = attachChatRealtimeRoomLifecycle(transport, "room-01", target, {
      visibilityTarget,
    });

    expect(transport.claimRoom).toHaveBeenCalledWith("room-01");

    cleanup();

    expect(transport.releaseRoom).toHaveBeenCalledWith("room-01");
    expect(target.listenerCount()).toBe(0);
    expect(visibilityTarget.listenerCount()).toBe(0);
    expect(transport.observe).toHaveBeenCalledTimes(1);
    expect(transport.observeRoom).toHaveBeenCalledTimes(1);
  });

  it("bfcache pageshow 뒤 연결이 준비되면 idle 방을 한 번 다시 claim한다", () => {
    const transport = createFakeTransport({ connectionStatus: "reconnecting" });
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget();
    const scheduledClaims: Array<() => void> = [];

    attachChatRealtimeRoomLifecycle(transport, "room-01", target, {
      scheduleRoomClaim: (claim) => scheduledClaims.push(claim),
      visibilityTarget,
    });

    target.dispatch("pageshow");
    scheduledClaims[0]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(1);

    transport.setConnectionStatus("connected");
    scheduledClaims[1]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(2);
  });

  it("focus와 visibilitychange가 연속 발생해도 replaced 방 reclaim을 한 번만 예약한다", () => {
    const transport = createFakeTransport({
      connectionStatus: "connected",
      roomId: "room-01",
      roomStatus: "replaced",
    });
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget();
    const scheduledClaims: Array<() => void> = [];

    attachChatRealtimeRoomLifecycle(transport, "room-01", target, {
      scheduleRoomClaim: (claim) => scheduledClaims.push(claim),
      visibilityTarget,
    });

    target.dispatch("focus");
    visibilityTarget.dispatchVisibilityChange();
    target.dispatch("pageshow");

    expect(scheduledClaims).toHaveLength(1);

    scheduledClaims[0]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(2);
  });

  it("화면 분할 상태에서는 포커스를 받은 창만 replaced 방을 reclaim한다", () => {
    const transport = createFakeTransport({
      connectionStatus: "connected",
      roomId: "room-01",
      roomStatus: "replaced",
    });
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget({ focused: false });
    const scheduledClaims: Array<() => void> = [];

    attachChatRealtimeRoomLifecycle(transport, "room-01", target, {
      scheduleRoomClaim: (claim) => scheduledClaims.push(claim),
      visibilityTarget,
    });

    visibilityTarget.dispatchVisibilityChange();
    target.dispatch("pageshow");

    expect(scheduledClaims).toHaveLength(0);

    visibilityTarget.setFocused(true);
    target.dispatch("focus");
    scheduledClaims[0]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(2);
  });

  it("포커스 직후 ROOM_REPLACED가 도착해도 현재 창에서 자동 reclaim한다", () => {
    const transport = createFakeTransport({
      connectionStatus: "connected",
      roomId: "room-01",
      roomStatus: "active",
    });
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget();
    const scheduledClaims: Array<() => void> = [];

    attachChatRealtimeRoomLifecycle(transport, "room-01", target, {
      scheduleRoomClaim: (claim) => scheduledClaims.push(claim),
      visibilityTarget,
    });

    target.dispatch("focus");
    expect(scheduledClaims).toHaveLength(0);

    transport.setRoomStatus("replaced", "room-01");
    scheduledClaims[0]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(2);
  });

  it("다른 브라우저나 기기로 connection이 replaced된 경우 자동 reclaim하지 않는다", () => {
    const transport = createFakeTransport({
      connectionStatus: "replaced",
      roomId: "room-01",
      roomStatus: "replaced",
    });
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget();
    const scheduledClaims: Array<() => void> = [];

    attachChatRealtimeRoomLifecycle(transport, "room-01", target, {
      scheduleRoomClaim: (claim) => scheduledClaims.push(claim),
      visibilityTarget,
    });

    target.dispatch("focus");
    scheduledClaims[0]?.();
    transport.setConnectionStatus("connected");

    expect(transport.claimRoom).toHaveBeenCalledTimes(1);
  });

  it("hidden 전환 뒤에는 예약된 reclaim을 실행하지 않는다", () => {
    const transport = createFakeTransport({
      connectionStatus: "connected",
      roomId: "room-01",
      roomStatus: "replaced",
    });
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget();
    const scheduledClaims: Array<() => void> = [];

    attachChatRealtimeRoomLifecycle(transport, "room-01", target, {
      scheduleRoomClaim: (claim) => scheduledClaims.push(claim),
      visibilityTarget,
    });

    target.dispatch("focus");
    visibilityTarget.setVisibilityState("hidden");
    visibilityTarget.dispatchVisibilityChange();
    scheduledClaims[0]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(1);
  });

  it("cleanup 뒤 실행된 예약 작업은 방을 다시 claim하지 않는다", () => {
    const transport = createFakeTransport({
      connectionStatus: "connected",
      roomId: "room-01",
      roomStatus: "replaced",
    });
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget();
    const scheduledClaims: Array<() => void> = [];
    const cleanup = attachChatRealtimeRoomLifecycle(transport, "room-01", target, {
      scheduleRoomClaim: (claim) => scheduledClaims.push(claim),
      visibilityTarget,
    });

    target.dispatch("focus");
    cleanup();
    scheduledClaims[0]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(1);
  });
});

type FakeTransport = ChatRealtimeTransport & {
  setConnectionStatus(status: ChatConnectionStatus): void;
  setRoomStatus(status: ChatRoomSessionStatus, roomId?: string | null): void;
};

function createFakeTransport({
  connectionStatus = "connected",
  roomId = null,
  roomStatus = "idle",
}: Readonly<{
  connectionStatus?: ChatConnectionStatus;
  roomId?: string | null;
  roomStatus?: ChatRoomSessionStatus;
}> = {}): FakeTransport {
  let currentConnectionStatus = connectionStatus;
  let currentRoomId = roomId;
  let currentRoomStatus = roomStatus;
  const connectionListeners = new Set<() => void>();
  const roomListeners = new Set<() => void>();

  return {
    acknowledgeRealtimeEventDelivery: vi.fn(),
    attach: vi.fn(() => vi.fn()),
    claimRoom: vi.fn(),
    clearDiagnostics: vi.fn(() => Promise.resolve()),
    deleteRoomMessage: vi.fn(),
    editRoomMessage: vi.fn(),
    confirmRoomReadState: vi.fn(),
    getDiagnosticSnapshot: vi.fn(() =>
      Promise.reject(new Error("Diagnostics are not used in this test.")),
    ),
    getRealtimeEventDelivery: vi.fn(() => null),
    getPrincipalGeneration: vi.fn(() => 0),
    getRoomSnapshot: vi.fn(() => ({
      status: currentRoomStatus,
      roomId: currentRoomId,
      generation: 0,
      replacedByRoomId: currentRoomStatus === "replaced" ? "room-02" : null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    })),
    getSnapshot: vi.fn(() => ({
      status: currentConnectionStatus,
      error: null,
    })),
    markRoomSnapshotApplied: vi.fn(),
    observeMessageCommandEvent: vi.fn(() => vi.fn()),
    observeMessageDeliveryLifecycle: vi.fn(() => vi.fn()),
    observeMessageMutationLifecycle: vi.fn(() => vi.fn()),
    observeMessageMutationEvent: vi.fn(() => vi.fn()),
    observeRealtimeEventDelivery: vi.fn(() => vi.fn()),
    observePrincipalGeneration: vi.fn(() => vi.fn()),
    observeRoomReadStateConfirmation: vi.fn(() => vi.fn()),
    observeRoom: vi.fn((listener) => {
      roomListeners.add(listener);
      return () => roomListeners.delete(listener);
    }),
    observeRoomInboxEvent: vi.fn(() => vi.fn()),
    observe: vi.fn((listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    }),
    reconnect: vi.fn(),
    releaseRoom: vi.fn(),
    sendRoomMessage: vi.fn(),
    setConnectionStatus(status) {
      currentConnectionStatus = status;
      connectionListeners.forEach((listener) => listener());
    },
    setRoomStatus(status, nextRoomId = currentRoomId) {
      currentRoomStatus = status;
      currentRoomId = nextRoomId;
      roomListeners.forEach((listener) => listener());
    },
  };
}

type RoomLifecycleEvent = "blur" | "focus" | "pagehide" | "pageshow";

function createFakeTarget(): ChatRealtimeRoomLifecycleTarget & {
  dispatch(type: RoomLifecycleEvent): void;
  listenerCount(): number;
} {
  const listeners = new Map<RoomLifecycleEvent, Set<() => void>>();

  return {
    addEventListener: vi.fn((type, listener) => {
      const eventListeners = listeners.get(type) ?? new Set();
      eventListeners.add(listener);
      listeners.set(type, eventListeners);
    }),
    removeEventListener: vi.fn((type, listener) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch(type) {
      listeners.get(type)?.forEach((listener) => listener());
    },
    listenerCount() {
      return [...listeners.values()].reduce(
        (count, eventListeners) => count + eventListeners.size,
        0,
      );
    },
  };
}

function createFakeVisibilityTarget({
  focused = true,
  visibilityState = "visible",
}: Readonly<{
  focused?: boolean;
  visibilityState?: DocumentVisibilityState;
}> = {}): ChatRealtimeRoomVisibilityTarget & {
  dispatchVisibilityChange(): void;
  listenerCount(): number;
  setFocused(focused: boolean): void;
  setVisibilityState(state: DocumentVisibilityState): void;
} {
  let currentFocused = focused;
  let currentVisibilityState = visibilityState;
  const listeners = new Set<() => void>();

  return {
    get visibilityState() {
      return currentVisibilityState;
    },
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
    hasFocus: vi.fn(() => currentFocused),
    dispatchVisibilityChange() {
      listeners.forEach((listener) => listener());
    },
    listenerCount() {
      return listeners.size;
    },
    setFocused(nextFocused) {
      currentFocused = nextFocused;
    },
    setVisibilityState(state) {
      currentVisibilityState = state;
    },
  };
}
