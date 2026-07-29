import { describe, expect, it, vi } from "vitest";
import {
  CHAT_STOMP_HEARTBEAT_MS,
  CHAT_STOMP_RECONNECT_DELAY_MS,
  createChatStompClient,
  createChatStompDebug,
} from "./chat-stomp-client";

describe("createChatStompClient", () => {
  it("로컬 채팅 서버 계약에 맞는 비활성 STOMP Client를 생성한다", () => {
    const client = createChatStompClient();

    expect(client.brokerURL).toBe("ws://localhost:8082/ws");
    expect(client.connectHeaders).toEqual({});
    expect(client.heartbeatIncoming).toBe(CHAT_STOMP_HEARTBEAT_MS);
    expect(client.heartbeatOutgoing).toBe(CHAT_STOMP_HEARTBEAT_MS);
    expect(client.reconnectDelay).toBe(CHAT_STOMP_RECONNECT_DELAY_MS);
    expect(client.active).toBe(false);
  });

  it("STOMP CONNECT 헤더에 브라우저 쿠키나 Authorization을 복제하지 않는다", () => {
    const client = createChatStompClient();

    expect(client.connectHeaders).not.toHaveProperty("Authorization");
    expect(client.connectHeaders).not.toHaveProperty("Cookie");
  });

  it("테스트나 확장 지점에서 broker URL과 debug 함수를 주입할 수 있다", () => {
    const debug = vi.fn();
    const client = createChatStompClient({
      brokerURL: "wss://chat.example.com/ws",
      debug,
    });

    expect(client.brokerURL).toBe("wss://chat.example.com/ws");
    expect(client.debug).toBe(debug);
  });
});

describe("createChatStompDebug", () => {
  it("개발 환경에서는 STOMP 로그에 출처를 붙인다", () => {
    const log = vi.fn();

    createChatStompDebug("development", log)("connected");

    expect(log).toHaveBeenCalledWith("[chat:stomp] connected");
  });

  it("개발 환경이 아니면 로그를 출력하지 않는다", () => {
    const log = vi.fn();

    createChatStompDebug("production", log)("connected");

    expect(log).not.toHaveBeenCalled();
  });
});
