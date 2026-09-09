import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachChatAuthenticationSessionRecovery,
  CHAT_AUTHENTICATION_RECOVERY_RETRY_DELAYS_MS,
  type ChatAuthenticationRecoveryPageTarget,
  type ChatAuthenticationRecoveryVisibilityTarget,
} from "./chat-authentication-session-recovery";

afterEach(() => {
  vi.useRealTimers();
});

describe("attachChatAuthenticationSessionRecovery", () => {
  it("현재 세션이 유효하면 채팅 인증 상태를 해제한다", async () => {
    const runtime = createRuntime();
    const onRecovered = vi.fn();

    const recovery = attachChatAuthenticationSessionRecovery({
      onRecovered,
      onStatusChange: runtime.onStatusChange,
      pageTarget: runtime.pageTarget,
      recoverAccessToken: vi.fn().mockResolvedValue("authenticated"),
      visibilityTarget: runtime.visibilityTarget,
    });
    await flushPromises();

    expect(runtime.onStatusChange).toHaveBeenCalledWith("checking");
    expect(onRecovered).toHaveBeenCalledTimes(1);
    recovery.dispose();
  });

  it("refresh 인증이 거절된 경우에만 로그인 필요 상태로 전환한다", async () => {
    const runtime = createRuntime();

    const recovery = attachChatAuthenticationSessionRecovery({
      onRecovered: vi.fn(),
      onStatusChange: runtime.onStatusChange,
      pageTarget: runtime.pageTarget,
      recoverAccessToken: vi.fn().mockResolvedValue("authentication-required"),
      visibilityTarget: runtime.visibilityTarget,
    });
    await flushPromises();

    expect(runtime.onStatusChange).toHaveBeenLastCalledWith("authentication-required");
    recovery.dispose();
  });

  it("일시 오류는 제한적으로 재시도하고 성공하면 복구한다", async () => {
    vi.useFakeTimers();
    const runtime = createRuntime();
    const onRecovered = vi.fn();
    const recoverAccessToken = vi
      .fn()
      .mockResolvedValueOnce("temporarily-unavailable")
      .mockResolvedValueOnce("authenticated");

    const recovery = attachChatAuthenticationSessionRecovery({
      onRecovered,
      onStatusChange: runtime.onStatusChange,
      pageTarget: runtime.pageTarget,
      recoverAccessToken,
      visibilityTarget: runtime.visibilityTarget,
    });
    await flushPromises();

    expect(runtime.onStatusChange).toHaveBeenLastCalledWith("temporarily-unavailable");

    await vi.advanceTimersByTimeAsync(CHAT_AUTHENTICATION_RECOVERY_RETRY_DELAYS_MS[0]);

    expect(recoverAccessToken).toHaveBeenCalledTimes(2);
    expect(onRecovered).toHaveBeenCalledTimes(1);
    recovery.dispose();
  });

  it("복귀 이벤트가 겹쳐도 진행 중인 인증 확인을 공유한다", async () => {
    const runtime = createRuntime();
    let finishRecovery: ((result: "authenticated") => void) | undefined;
    const recoverAccessToken = vi.fn(
      () =>
        new Promise<"authenticated">((resolve) => {
          finishRecovery = resolve;
        }),
    );
    const recovery = attachChatAuthenticationSessionRecovery({
      onRecovered: vi.fn(),
      onStatusChange: runtime.onStatusChange,
      pageTarget: runtime.pageTarget,
      recoverAccessToken,
      visibilityTarget: runtime.visibilityTarget,
    });

    runtime.pageTarget.dispatch("pageshow");
    runtime.pageTarget.dispatch("online");
    runtime.visibilityTarget.dispatch();

    expect(recoverAccessToken).toHaveBeenCalledTimes(1);
    finishRecovery?.("authenticated");
    await flushPromises();
    recovery.dispose();
  });
});

function createRuntime() {
  const pageListeners = {
    online: new Set<() => void>(),
    pageshow: new Set<() => void>(),
  };
  const visibilityListeners = new Set<() => void>();
  let visibilityState: DocumentVisibilityState = "visible";

  const pageTarget: ChatAuthenticationRecoveryPageTarget & {
    dispatch(type: "online" | "pageshow"): void;
  } = {
    addEventListener(type, listener) {
      pageListeners[type].add(listener);
    },
    dispatch(type) {
      pageListeners[type].forEach((listener) => listener());
    },
    removeEventListener(type, listener) {
      pageListeners[type].delete(listener);
    },
  };
  const visibilityTarget: ChatAuthenticationRecoveryVisibilityTarget & {
    dispatch(): void;
  } = {
    addEventListener(_type, listener) {
      visibilityListeners.add(listener);
    },
    dispatch() {
      visibilityListeners.forEach((listener) => listener());
    },
    get visibilityState() {
      return visibilityState;
    },
    removeEventListener(_type, listener) {
      visibilityListeners.delete(listener);
    },
  };

  return {
    onStatusChange: vi.fn(),
    pageTarget,
    setVisibilityState(nextVisibilityState: DocumentVisibilityState) {
      visibilityState = nextVisibilityState;
    },
    visibilityTarget,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
