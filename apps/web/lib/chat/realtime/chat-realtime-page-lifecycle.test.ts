import { describe, expect, it, vi } from "vitest";
import type { ChatRealtimeTransport } from "./chat-realtime-transport";
import {
  attachChatRealtimePageLifecycle,
  type ChatRealtimePageLifecycleTarget,
} from "./chat-realtime-page-lifecycle";

describe("attachChatRealtimePageLifecycle", () => {
  it("pagehide에서 detach하고 pageshow에서 새 attachment를 만든다", () => {
    const detachFirst = vi.fn();
    const detachSecond = vi.fn();
    const transport = createFakeTransport(detachFirst, detachSecond);
    const target = createFakeTarget();

    const dispose = attachChatRealtimePageLifecycle(transport, target);

    target.dispatch("pagehide");
    target.dispatch("pagehide");
    expect(detachFirst).toHaveBeenCalledTimes(1);

    target.dispatch("pageshow");
    target.dispatch("pageshow");
    expect(transport.attach).toHaveBeenCalledTimes(2);

    dispose();
    dispose();
    expect(detachSecond).toHaveBeenCalledTimes(1);
  });

  it("dispose 후에는 page event에 반응하지 않는다", () => {
    const detach = vi.fn();
    const transport = createFakeTransport(detach);
    const target = createFakeTarget();

    attachChatRealtimePageLifecycle(transport, target)();
    target.dispatch("pageshow");

    expect(transport.attach).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledTimes(1);
  });
});

type FakeTransport = ChatRealtimeTransport & {
  attach: ReturnType<typeof vi.fn<() => () => void>>;
};

function createFakeTransport(...detachments: Array<() => void>): FakeTransport {
  return {
    acknowledgeRealtimeEventDelivery: () => {},
    attach: vi.fn(() => detachments.shift() ?? (() => {})),
    claimRoom: () => {},
    clearDiagnostics: () => Promise.resolve(),
    deleteRoomMessage: () => {},
    editRoomMessage: () => {},
    getDiagnosticSnapshot: () =>
      Promise.reject(new Error("Diagnostics are not used in this test.")),
    getRealtimeEventDelivery: () => null,
    getRoomSnapshot: () => ({
      status: "idle",
      roomId: null,
      generation: 0,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    }),
    getSnapshot: () => ({ status: "idle", error: null }),
    markRoomSnapshotApplied: () => {},
    observeMessageCommandEvent: () => () => {},
    observeMessageDeliveryLifecycle: () => () => {},
    observeMessageMutationLifecycle: () => () => {},
    observeMessageMutationEvent: () => () => {},
    observeRealtimeEventDelivery: () => () => {},
    observeRoom: () => () => {},
    observeRoomInboxEvent: () => () => {},
    observe: () => () => {},
    reconnect: () => {},
    releaseRoom: () => {},
    sendRoomMessage: () => {},
  };
}

type FakeTarget = ChatRealtimePageLifecycleTarget & {
  dispatch(type: "pagehide" | "pageshow"): void;
};

function createFakeTarget(): FakeTarget {
  const listeners = {
    pagehide: new Set<() => void>(),
    pageshow: new Set<() => void>(),
  };

  return {
    addEventListener(type, listener) {
      listeners[type].add(listener);
    },
    dispatch(type) {
      listeners[type].forEach((listener) => listener());
    },
    removeEventListener(type, listener) {
      listeners[type].delete(listener);
    },
  };
}
