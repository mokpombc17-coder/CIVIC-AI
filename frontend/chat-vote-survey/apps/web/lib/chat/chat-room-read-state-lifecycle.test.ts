import { describe, expect, it, vi } from "vitest";
import { attachChatRoomReadStateLifecycle } from "./chat-room-read-state-lifecycle";
import type {
  ChatConnectionSnapshot,
  ChatRoomReadStateConfirmation,
} from "./realtime/chat-realtime-transport";

describe("attachChatRoomReadStateLifecycle", () => {
  it("focus·online·연결 복구에서 pending 재시도를 요청한다", () => {
    const runtime = createRuntime();
    const detach = attachChatRoomReadStateLifecycle(runtime.options);

    runtime.dispatch("focus");
    runtime.dispatch("online");
    runtime.setConnectionStatus("reconnecting");
    runtime.setConnectionStatus("connected");

    expect(runtime.coordinator.retryPending).toHaveBeenCalledTimes(3);
    expect(runtime.coordinator.resetForPrincipalChange).not.toHaveBeenCalled();

    detach();
    runtime.dispatch("focus");
    runtime.setConnectionStatus("reconnecting");
    runtime.setConnectionStatus("connected");
    expect(runtime.coordinator.retryPending).toHaveBeenCalledTimes(3);
  });

  it("worker 인증 세대가 바뀔 때 이전 pending을 폐기한다", () => {
    const runtime = createRuntime();
    const detach = attachChatRoomReadStateLifecycle(runtime.options);

    runtime.setPrincipalGeneration(1);
    runtime.setPrincipalGeneration(2);

    expect(runtime.coordinator.resetForPrincipalChange).toHaveBeenCalledTimes(2);
    expect(runtime.coordinator.retryPending).not.toHaveBeenCalled();

    detach();
    runtime.setPrincipalGeneration(3);
    expect(runtime.coordinator.resetForPrincipalChange).toHaveBeenCalledTimes(2);
  });

  it("현재 인증 세대의 peer confirmation만 반영한다", () => {
    const runtime = createRuntime();
    const detach = attachChatRoomReadStateLifecycle(runtime.options);

    runtime.confirmFromPeer({
      principalGeneration: 0,
      readThroughSequence: 12,
      roomId: "room-1",
    });
    runtime.confirmFromPeer({
      principalGeneration: 99,
      readThroughSequence: 13,
      roomId: "room-1",
    });

    expect(runtime.coordinator.confirmFromPeer).toHaveBeenCalledOnce();
    expect(runtime.coordinator.confirmFromPeer).toHaveBeenCalledWith("room-1", 12);
    expect(runtime.onPeerConfirmed).toHaveBeenCalledOnce();

    detach();
  });
});

function createRuntime() {
  const listeners = new Map<string, Set<() => void>>();
  const connectionListeners = new Set<() => void>();
  const principalGenerationListeners = new Set<() => void>();
  const confirmationListeners = new Set<(confirmation: ChatRoomReadStateConfirmation) => void>();
  let principalGeneration = 0;
  let snapshot: ChatConnectionSnapshot = {
    error: null,
    status: "connected",
  };
  const coordinator = {
    confirmFromPeer: vi.fn(() => true),
    resetForPrincipalChange: vi.fn(),
    retryPending: vi.fn(),
  };
  const onPeerConfirmed = vi.fn();
  const target = {
    addEventListener: vi.fn((type: string, listener: () => void) => {
      const current = listeners.get(type) ?? new Set();
      current.add(listener);
      listeners.set(type, current);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    }),
  };
  const transport = {
    getPrincipalGeneration: () => principalGeneration,
    getSnapshot: () => snapshot,
    observe: (listener: () => void) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    observePrincipalGeneration: (listener: () => void) => {
      principalGenerationListeners.add(listener);
      return () => principalGenerationListeners.delete(listener);
    },
    observeRoomReadStateConfirmation: (
      listener: (confirmation: ChatRoomReadStateConfirmation) => void,
    ) => {
      confirmationListeners.add(listener);
      return () => confirmationListeners.delete(listener);
    },
  };

  return {
    coordinator,
    confirmFromPeer(confirmation: ChatRoomReadStateConfirmation) {
      confirmationListeners.forEach((listener) => listener(confirmation));
    },
    dispatch(type: string) {
      listeners.get(type)?.forEach((listener) => listener());
    },
    onPeerConfirmed,
    options: { coordinator, onPeerConfirmed, target, transport },
    setPrincipalGeneration(nextPrincipalGeneration: number) {
      principalGeneration = nextPrincipalGeneration;
      principalGenerationListeners.forEach((listener) => listener());
    },
    setConnectionStatus(status: ChatConnectionSnapshot["status"]) {
      snapshot = { error: null, status };
      connectionListeners.forEach((listener) => listener());
    },
  };
}
