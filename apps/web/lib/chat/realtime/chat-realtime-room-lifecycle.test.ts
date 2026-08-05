import { describe, expect, it, vi } from "vitest";
import type { ChatRealtimeTransport } from "./chat-realtime-transport";
import {
  attachChatRealtimeRoomLifecycle,
  type ChatRealtimeRoomLifecycleTarget,
} from "./chat-realtime-room-lifecycle";

describe("attachChatRealtimeRoomLifecycle", () => {
  it("mount에서 방을 claim하고 cleanup에서 같은 방을 release한다", () => {
    const transport = createFakeTransport();
    const target = createFakeTarget();

    const cleanup = attachChatRealtimeRoomLifecycle(transport, "room-01", target);

    expect(transport.claimRoom).toHaveBeenCalledWith("room-01");

    cleanup();

    expect(transport.releaseRoom).toHaveBeenCalledWith("room-01");
    expect(target.listener).toBeNull();
  });

  it("bfcache pageshow에서는 transport 재연결 뒤 실행할 방 claim을 예약한다", () => {
    const transport = createFakeTransport();
    const target = createFakeTarget();
    const scheduledClaims: Array<() => void> = [];

    attachChatRealtimeRoomLifecycle(transport, "room-01", target, (claim) => {
      scheduledClaims.push(claim);
    });

    target.dispatchPageShow();

    expect(transport.claimRoom).toHaveBeenCalledTimes(1);
    expect(scheduledClaims).toHaveLength(1);

    scheduledClaims[0]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(2);
  });

  it("cleanup 뒤 실행된 예약 작업은 방을 다시 claim하지 않는다", () => {
    const transport = createFakeTransport();
    const target = createFakeTarget();
    const scheduledClaims: Array<() => void> = [];
    const cleanup = attachChatRealtimeRoomLifecycle(transport, "room-01", target, (claim) => {
      scheduledClaims.push(claim);
    });

    target.dispatchPageShow();
    cleanup();
    scheduledClaims[0]?.();

    expect(transport.claimRoom).toHaveBeenCalledTimes(1);
  });
});

function createFakeTransport(): ChatRealtimeTransport {
  return {
    acknowledgeRealtimeEventDelivery: vi.fn(),
    attach: vi.fn(() => vi.fn()),
    claimRoom: vi.fn(),
    clearDiagnostics: vi.fn(() => Promise.resolve()),
    deleteRoomMessage: vi.fn(),
    editRoomMessage: vi.fn(),
    getDiagnosticSnapshot: vi.fn(() =>
      Promise.reject(new Error("Diagnostics are not used in this test.")),
    ),
    getRealtimeEventDelivery: vi.fn(() => null),
    getRoomSnapshot: vi.fn(() => ({
      status: "idle" as const,
      roomId: null,
      generation: 0,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    })),
    getSnapshot: vi.fn(() => ({
      status: "idle" as const,
      error: null,
    })),
    markRoomSnapshotApplied: vi.fn(),
    observeMessageCommandEvent: vi.fn(() => vi.fn()),
    observeMessageDeliveryLifecycle: vi.fn(() => vi.fn()),
    observeMessageMutationLifecycle: vi.fn(() => vi.fn()),
    observeMessageMutationEvent: vi.fn(() => vi.fn()),
    observeRealtimeEventDelivery: vi.fn(() => vi.fn()),
    observeRoom: vi.fn(() => vi.fn()),
    observeRoomInboxEvent: vi.fn(() => vi.fn()),
    observe: vi.fn(() => vi.fn()),
    reconnect: vi.fn(),
    releaseRoom: vi.fn(),
    sendRoomMessage: vi.fn(),
  };
}

function createFakeTarget(): ChatRealtimeRoomLifecycleTarget & {
  readonly listener: (() => void) | null;
  dispatchPageShow(): void;
} {
  let listener: (() => void) | null = null;

  return {
    get listener() {
      return listener;
    },
    addEventListener: vi.fn((_type, nextListener) => {
      listener = nextListener;
    }),
    removeEventListener: vi.fn((_type, removedListener) => {
      if (listener === removedListener) {
        listener = null;
      }
    }),
    dispatchPageShow() {
      listener?.();
    },
  };
}
