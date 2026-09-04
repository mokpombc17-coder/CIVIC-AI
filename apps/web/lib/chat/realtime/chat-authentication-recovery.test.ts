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
    const ensureAccessToken = vi.fn().mockResolvedValue(true);
    const onAuthenticationRecovered = vi.fn();
    const onAuthenticationRequired = vi.fn();

    const detach = attachChatAuthenticationRecovery(transport, {
      ensureAccessToken,
      onAuthenticationRecovered,
      onAuthenticationRequired,
    });

    transport.setStatus("authentication-required");
    await flushPromises();

    expect(ensureAccessToken).toHaveBeenCalledTimes(1);
    expect(onAuthenticationRecovered).toHaveBeenCalledTimes(1);
    expect(transport.reconnect).toHaveBeenCalledWith("authentication-succeeded");
    expect(onAuthenticationRequired).not.toHaveBeenCalled();

    detach();
  });

  it("token 갱신에 실패하면 로그인이 필요한 상태를 알린다", async () => {
    const transport = createTransport("authentication-required");
    const ensureAccessToken = vi.fn().mockResolvedValue(false);
    const onAuthenticationRecovered = vi.fn();
    const onAuthenticationRequired = vi.fn();

    const detach = attachChatAuthenticationRecovery(transport, {
      ensureAccessToken,
      onAuthenticationRecovered,
      onAuthenticationRequired,
    });
    await flushPromises();

    expect(ensureAccessToken).toHaveBeenCalledTimes(1);
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
    expect(onAuthenticationRecovered).not.toHaveBeenCalled();
    expect(transport.reconnect).not.toHaveBeenCalled();

    detach();
  });

  it("복구 직후 다시 인증이 거절되면 refresh를 반복하지 않는다", async () => {
    const transport = createTransport();
    const ensureAccessToken = vi.fn().mockResolvedValue(true);
    const onAuthenticationRequired = vi.fn();

    const detach = attachChatAuthenticationRecovery(transport, {
      ensureAccessToken,
      onAuthenticationRecovered: vi.fn(),
      onAuthenticationRequired,
    });

    transport.setStatus("authentication-required");
    await flushPromises();
    transport.setStatus("connecting");
    transport.setStatus("authentication-required");
    await flushPromises();

    expect(ensureAccessToken).toHaveBeenCalledTimes(1);
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);

    detach();
  });

  it("연결이 정상화된 뒤 다음 인증 만료에는 다시 한 번 복구를 시도한다", async () => {
    const transport = createTransport();
    const ensureAccessToken = vi.fn().mockResolvedValue(true);

    const detach = attachChatAuthenticationRecovery(transport, {
      ensureAccessToken,
      onAuthenticationRecovered: vi.fn(),
      onAuthenticationRequired: vi.fn(),
    });

    transport.setStatus("authentication-required");
    await flushPromises();
    transport.setStatus("connected");
    transport.setStatus("authentication-required");
    await flushPromises();

    expect(ensureAccessToken).toHaveBeenCalledTimes(2);

    detach();
  });

  it("외부 refresh 이벤트가 먼저 재연결한 경우 중복 재연결하지 않는다", async () => {
    const transport = createTransport("authentication-required");
    const onAuthenticationRecovered = vi.fn(() => {
      transport.setStatus("connecting");
    });

    const detach = attachChatAuthenticationRecovery(transport, {
      ensureAccessToken: vi.fn().mockResolvedValue(true),
      onAuthenticationRecovered,
      onAuthenticationRequired: vi.fn(),
    });
    await flushPromises();

    expect(onAuthenticationRecovered).toHaveBeenCalledTimes(1);
    expect(transport.reconnect).not.toHaveBeenCalled();

    detach();
  });
});
