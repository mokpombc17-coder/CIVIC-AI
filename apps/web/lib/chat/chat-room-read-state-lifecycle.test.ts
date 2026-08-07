import { describe, expect, it, vi } from "vitest";
import { AUTHENTICATION_SUCCEEDED_EVENT } from "@/lib/auth/authentication-session-events";
import { attachChatRoomReadStateLifecycle } from "./chat-room-read-state-lifecycle";
import type { ChatConnectionSnapshot } from "./realtime/chat-realtime-transport";

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

  it("로그인 성공마다 인증 세대를 교체해 이전 pending을 폐기한다", () => {
    const runtime = createRuntime();
    const detach = attachChatRoomReadStateLifecycle(runtime.options);

    runtime.dispatch(AUTHENTICATION_SUCCEEDED_EVENT);
    runtime.dispatch(AUTHENTICATION_SUCCEEDED_EVENT);

    expect(runtime.coordinator.resetForPrincipalChange).toHaveBeenCalledTimes(2);
    expect(runtime.coordinator.retryPending).not.toHaveBeenCalled();

    detach();
  });
});

function createRuntime() {
  const listeners = new Map<string, Set<() => void>>();
  const connectionListeners = new Set<() => void>();
  let snapshot: ChatConnectionSnapshot = {
    error: null,
    status: "connected",
  };
  const coordinator = {
    resetForPrincipalChange: vi.fn(),
    retryPending: vi.fn(),
  };
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
    getSnapshot: () => snapshot,
    observe: (listener: () => void) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
  };

  return {
    coordinator,
    dispatch(type: string) {
      listeners.get(type)?.forEach((listener) => listener());
    },
    options: { coordinator, target, transport },
    setConnectionStatus(status: ChatConnectionSnapshot["status"]) {
      snapshot = { error: null, status };
      connectionListeners.forEach((listener) => listener());
    },
  };
}
