import { describe, expect, it, vi } from "vitest";
import type { ChatRealtimeTransport } from "./chat-realtime-transport";
import {
  attachChatRealtimePageLifecycle,
  type ChatRealtimePageLifecycleTarget,
  type ChatRealtimeVisibilityTarget,
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

  it("PWA가 visible 또는 online 상태로 복귀하면 연결 복구를 요청한다", () => {
    const transport = createFakeTransport();
    const target = createFakeTarget();
    const visibilityTarget = createFakeVisibilityTarget();
    const onResume = vi.fn();

    const dispose = attachChatRealtimePageLifecycle(transport, target, {
      onResume,
      visibilityTarget,
    });

    visibilityTarget.setVisibility("hidden");
    visibilityTarget.dispatch();
    expect(onResume).not.toHaveBeenCalled();

    visibilityTarget.setVisibility("visible");
    visibilityTarget.dispatch();
    target.dispatch("online");

    expect(onResume).toHaveBeenCalledTimes(2);
    dispose();
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
    confirmRoomReadState: () => {},
    getDiagnosticSnapshot: () =>
      Promise.reject(new Error("Diagnostics are not used in this test.")),
    getRealtimeEventDelivery: () => null,
    getPrincipalGeneration: () => 0,
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
    observePrincipalGeneration: () => () => {},
    observeRoomReadStateConfirmation: () => () => {},
    observeRoom: () => () => {},
    observeRoomInboxEvent: () => () => {},
    observe: () => () => {},
    reconnect: () => {},
    releaseRoom: () => {},
    sendRoomMessage: () => {},
  };
}

type FakeTarget = ChatRealtimePageLifecycleTarget & {
  dispatch(type: "online" | "pagehide" | "pageshow"): void;
};

function createFakeTarget(): FakeTarget {
  const listeners = {
    online: new Set<() => void>(),
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

type FakeVisibilityTarget = ChatRealtimeVisibilityTarget & {
  dispatch(): void;
  setVisibility(visibilityState: DocumentVisibilityState): void;
};

function createFakeVisibilityTarget(): FakeVisibilityTarget {
  const listeners = new Set<() => void>();
  let visibilityState: DocumentVisibilityState = "visible";

  return {
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    dispatch() {
      listeners.forEach((listener) => listener());
    },
    get visibilityState() {
      return visibilityState;
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    setVisibility(nextVisibilityState) {
      visibilityState = nextVisibilityState;
    },
  };
}
