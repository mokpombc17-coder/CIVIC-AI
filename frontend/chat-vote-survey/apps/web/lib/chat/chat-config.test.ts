import { describe, expect, it } from "vitest";
import {
  CHAT_API_PREFIX,
  CHAT_WEBSOCKET_PATH,
  createChatServerConfig,
  readChatRuntimeWebOrigin,
} from "./chat-config";

describe("createChatServerConfig", () => {
  it("로컬 기본 REST와 WebSocket 주소를 구성한다", () => {
    expect(createChatServerConfig()).toEqual({
      serverOrigin: "http://localhost:8082",
      apiBaseUrl: `http://localhost:8082${CHAT_API_PREFIX}`,
      webSocketUrl: `ws://localhost:8082${CHAT_WEBSOCKET_PATH}`,
    });
  });

  it("HTTPS 서버에는 wss WebSocket protocol을 사용한다", () => {
    expect(
      createChatServerConfig({
        serverUrl: "https://chat.example.com",
      }),
    ).toEqual({
      serverOrigin: "https://chat.example.com",
      apiBaseUrl: "https://chat.example.com/api/v1",
      webSocketUrl: "wss://chat.example.com/ws",
    });
  });

  it("서버 주소에 path나 query가 포함되면 거부한다", () => {
    expect(() =>
      createChatServerConfig({
        serverUrl: "http://localhost:8082/api",
      }),
    ).toThrow("Chat Resource Server URL에는 origin만 설정해야 합니다.");

    expect(() =>
      createChatServerConfig({
        serverUrl: "http://localhost:8082?profile=local",
      }),
    ).toThrow("Chat Resource Server URL에는 origin만 설정해야 합니다.");
  });

  it("localhost와 127.0.0.1을 섞으면 거부한다", () => {
    expect(() =>
      createChatServerConfig({
        serverUrl: "http://127.0.0.1:8082",
        webOrigin: "http://localhost:3000",
      }),
    ).toThrow(
      "로컬 웹과 Chat Resource Server는 localhost 또는 127.0.0.1 중 하나로 통일해야 합니다.",
    );
  });

  it("로컬 웹에서 원격 Chat Resource Server에 연결할 수 있다", () => {
    expect(
      createChatServerConfig({
        serverUrl: "https://chat.dev.example.com",
        webOrigin: "http://localhost:3000",
      }),
    ).toMatchObject({
      serverOrigin: "https://chat.dev.example.com",
    });
  });
});

describe("readChatRuntimeWebOrigin", () => {
  it("Window과 Worker가 공유하는 global location에서 origin을 읽는다", () => {
    expect(
      readChatRuntimeWebOrigin({
        location: {
          origin: "http://localhost:3000",
        },
      }),
    ).toBe("http://localhost:3000");
  });

  it("서버처럼 location이 없는 runtime에서는 origin을 생략한다", () => {
    expect(readChatRuntimeWebOrigin({})).toBeUndefined();
  });
});
