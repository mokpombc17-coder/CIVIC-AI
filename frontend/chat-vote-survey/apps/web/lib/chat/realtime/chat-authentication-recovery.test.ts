import { describe, expect, it, vi } from "vitest";
import type { ChatConnectionSnapshot } from "./chat-realtime-transport";
import { attachChatAuthenticationRecovery } from "./chat-authentication-recovery";

function createTransport(initialStatus: ChatConnectionSnapshot["status"] = "connected") {
  let snapshot: ChatConnectionSnapshot = { error: null, status: initialStatus };
  const listeners = new Set<() => void>();
  const reconnect = vi.fn();

  return {
    getSnapshot: () => snapshot,
    observe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reconnect,
    setStatus(status: ChatConnectionSnapshot["status"]) {
      snapshot = { error: null, status };
      listeners.forEach((listener) => listener());
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("attachChatAuthenticationRecovery", () => {
  it("인증 만료 시 access token을 갱신하고 실시간 연결을 복구한다", async () => {
    const transport = createTransport();
    const recoverAccessToken = vi.fn().mockResolvedValue("authenticated");
    const onAuthenticationRecovered = vi.fn();
    const onAuthenticationRequired = vi.fn();

    const recovery = attachChatAuthenticationRecovery(transport, {
      recoverAccessToken,
      onAuthenticationRecovered,
      onAuthenticationRequired,
    });

    transport.setStatus("authentication-required");
    await flushPromises();

    expect(recoverAccessToken).toHaveBeenCalledTimes(1);
    expect(onAuthenticationRecovered).toHaveBeenCalledTimes(1);
    expect(transport.reconnect).toHaveBeenCalledWith("authentication-succeeded");
    expect(onAuthenticationRequired).not.toHaveBeenCalled();

    recovery.detach();
  });

  it("token 갱신에 실패하면 로그인이 필요한 상태를 알린다", async () => {
    const transport = createTransport("authentication-required");
    const recoverAccessToken = vi.fn().mockResolvedValue("authentication-required");
    const onAuthenticationRecovered = vi.fn();
    const onAuthenticationRequired = vi.fn();

    const recovery = attachChatAuthenticationRecovery(transport, {
      recoverAccessToken,
      onAuthenticationRecovered,
      onAuthenticationRequired,
    });
    await flushPromises();

    expect(recoverAccessToken).toHaveBeenCalledTimes(1);
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
    expect(onAuthenticationRecovered).not.toHaveBeenCalled();
    expect(transport.reconnect).not.toHaveBeenCalled();

    recovery.detach();
  });

  it("일시적인 복구 실패는 로그인 필요로 확정하지 않고 foreground 재시도를 허용한다", async () => {
    const transport = createTransport("authentication-required");
    const recoverAccessToken = vi
      .fn()
      .mockResolvedValueOnce("temporarily-unavailable")
      .mockResolvedValueOnce("authenticated");
    const onAuthenticationRequired = vi.fn();

    const recovery = attachChatAuthenticationRecovery(transport, {
      recoverAccessToken,
      onAuthenticationRecovered: vi.fn(),
      onAuthenticationRequired,
    });
    await flushPromises();

    expect(onAuthenticationRequired).not.toHaveBeenCalled();

    recovery.retry();
    await flushPromises();

    expect(recoverAccessToken).toHaveBeenCalledTimes(2);
    expect(transport.reconnect).toHaveBeenCalledWith("authentication-succeeded");
    recovery.detach();
  });

  it("복구 직후 다시 인증이 거절되면 refresh를 반복하지 않는다", async () => {
    const transport = createTransport();
    const recoverAccessToken = vi.fn().mockResolvedValue("authenticated");
    const onAuthenticationRequired = vi.fn();

    const recovery = attachChatAuthenticationRecovery(transport, {
      recoverAccessToken,
      onAuthenticationRecovered: vi.fn(),
      onAuthenticationRequired,
    });

    transport.setStatus("authentication-required");
    await flushPromises();
    transport.setStatus("connecting");
    transport.setStatus("authentication-required");
    await flushPromises();

    expect(recoverAccessToken).toHaveBeenCalledTimes(1);
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);

    recovery.detach();
  });

  it("연결이 정상화된 뒤 다음 인증 만료에는 다시 한 번 복구를 시도한다", async () => {
    const transport = createTransport();
    const recoverAccessToken = vi.fn().mockResolvedValue("authenticated");

    const recovery = attachChatAuthenticationRecovery(transport, {
      recoverAccessToken,
      onAuthenticationRecovered: vi.fn(),
      onAuthenticationRequired: vi.fn(),
    });

    transport.setStatus("authentication-required");
    await flushPromises();
    transport.setStatus("connected");
    transport.setStatus("authentication-required");
    await flushPromises();

    expect(recoverAccessToken).toHaveBeenCalledTimes(2);

    recovery.detach();
  });

  it("외부 refresh 이벤트와 진행 중인 복구가 겹쳐도 한 번만 재연결한다", async () => {
    const transport = createTransport("authentication-required");
    const onAuthenticationRecovered = vi.fn();

    const recovery = attachChatAuthenticationRecovery(transport, {
      recoverAccessToken: vi.fn().mockResolvedValue("authenticated"),
      onAuthenticationRecovered,
      onAuthenticationRequired: vi.fn(),
    });
    recovery.authenticationRefreshed();
    await flushPromises();

    expect(onAuthenticationRecovered).toHaveBeenCalledTimes(1);
    expect(transport.reconnect).toHaveBeenCalledTimes(1);

    recovery.detach();
  });
});
