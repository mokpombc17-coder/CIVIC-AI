import type { IFrame, IMessage, StompSubscription } from "@stomp/stompjs";
import { describe, expect, it, vi } from "vitest";
import { DirectStompTransport, type DirectStompClient } from "./direct-stomp-transport";

describe("DirectStompTransport", () => {
  it("첫 consumer가 붙을 때만 연결하고 마지막 consumer가 떨어질 때 연결을 종료한다", async () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    const detachFirst = transport.attach();
    const detachSecond = transport.attach();

    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toEqual({
      status: "connecting",
      error: null,
    });

    detachFirst();
    expect(client.deactivate).not.toHaveBeenCalled();

    detachSecond();
    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot().status).toBe("disconnecting");

    await Promise.resolve();
    expect(transport.getSnapshot()).toEqual({
      status: "disconnected",
      error: null,
    });
  });

  it("detach 함수는 여러 번 호출해도 attachment를 한 번만 해제한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);
    const detach = transport.attach();

    detach();
    detach();

    expect(client.deactivate).toHaveBeenCalledTimes(1);
  });

  it("STOMP 및 WebSocket callback을 직렬화 가능한 연결 상태로 변환한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);
    const listener = vi.fn();

    transport.observe(listener);
    transport.attach();
    client.onConnect({} as IFrame);

    expect(transport.getSnapshot()).toEqual({
      status: "connected",
      error: null,
    });

    client.onStompError({
      headers: { message: "Access denied" },
      body: "",
    } as unknown as IFrame);

    expect(transport.getSnapshot()).toEqual({
      status: "error",
      error: {
        source: "stomp",
        message: "Access denied",
      },
    });

    client.onWebSocketClose({
      reason: "network lost",
    } as CloseEvent);

    expect(transport.getSnapshot()).toEqual({
      status: "reconnecting",
      error: {
        source: "websocket",
        message: "network lost",
      },
    });
    expect(listener).toHaveBeenCalled();
  });

  it("4001 CONNECTION_REPLACED에서는 자동 및 수동 재연결을 중단한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    client.onWebSocketClose({
      code: 4001,
      reason: "CONNECTION_REPLACED",
    } as CloseEvent);

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toEqual({
      status: "replaced",
      error: {
        source: "websocket",
        code: "CONNECTION_REPLACED",
        message: "다른 브라우저, 프로필 또는 기기에서 채팅에 연결하여 이 연결이 종료되었습니다.",
      },
    });

    transport.reconnect();

    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(client.forceDisconnect).not.toHaveBeenCalled();
  });

  it("활성 연결은 강제로 닫아 재연결하고 비활성 연결은 다시 activate한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    transport.reconnect();

    expect(client.forceDisconnect).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot().status).toBe("reconnecting");

    client.setActive(false);
    transport.reconnect();

    expect(client.activate).toHaveBeenCalledTimes(2);
    expect(transport.getSnapshot()).toEqual({
      status: "connecting",
      error: null,
    });
  });

  it("consumer가 없으면 reconnect 요청을 무시한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.reconnect();

    expect(client.activate).not.toHaveBeenCalled();
    expect(client.forceDisconnect).not.toHaveBeenCalled();
  });

  it("SharedWorker 미지원 환경에서도 동일한 방 세션 API를 제공한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);
    const listener = vi.fn();

    transport.observeRoom(listener);
    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");

    expect(transport.getRoomSnapshot()).toEqual({
      status: "active",
      roomId: "room-01",
      generation: 1,
      replacedByRoomId: null,
      error: null,
    });

    transport.releaseRoom("room-01");
    expect(transport.getRoomSnapshot()).toEqual({
      status: "idle",
      roomId: null,
      generation: 2,
      replacedByRoomId: null,
      error: null,
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("Direct fallback도 다른 방 전환 시 동일한 4-frame 순서를 사용한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.frames.length = 0;

    transport.claimRoom("room-02");

    expect(client.frames).toEqual([
      "UNSUBSCRIBE /topic/rooms/room-01/messages",
      "UNSUBSCRIBE /topic/rooms/room-01/room-events",
      "SUBSCRIBE /topic/rooms/room-02/messages",
      "SUBSCRIBE /topic/rooms/room-02/room-events",
    ]);
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "active",
      roomId: "room-02",
    });
  });

  it("Direct fallback도 서버 구독 거절을 room session 오류로 변환한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "REJECTED",
        code: "ACTIVE_ROOM_LIMIT_EXCEEDED",
        destination: "/topic/rooms/room-01/messages",
      }),
    );

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "error",
      roomId: "room-01",
      error: {
        code: "SUBSCRIPTION_REJECTED",
        serverCode: "ACTIVE_ROOM_LIMIT_EXCEEDED",
      },
    });
  });

  it("유효하지 않은 roomId는 Direct fallback에서도 로컬 오류로 거절한다", () => {
    const transport = new DirectStompTransport(createFakeClient());

    transport.claimRoom("invalid room");

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "error",
      roomId: "invalid room",
      error: {
        code: "INVALID_ROOM_ID",
      },
    });
  });
});

type FakeDirectStompClient = DirectStompClient & {
  deliver(destination: string, body: string): void;
  frames: string[];
  setActive(active: boolean): void;
};

function createFakeClient(): FakeDirectStompClient {
  let active = false;
  let nextSubscriptionId = 1;
  const frames: string[] = [];
  const callbacks = new Map<string, Map<string, (message: IMessage) => void>>();

  const client: FakeDirectStompClient = {
    get active() {
      return active;
    },
    setActive(value) {
      active = value;
    },
    activate: vi.fn(() => {
      active = true;
    }),
    deactivate: vi.fn(async () => {
      active = false;
    }),
    deliver(destination, body) {
      callbacks.get(destination)?.forEach((callback) => callback({ body } as unknown as IMessage));
    },
    forceDisconnect: vi.fn(),
    frames,
    onConnect: vi.fn(),
    onStompError: vi.fn(),
    onWebSocketClose: vi.fn(),
    onWebSocketError: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn((destination, callback) => {
      const id = `subscription-${nextSubscriptionId++}`;
      const destinationCallbacks = callbacks.get(destination) ?? new Map();
      destinationCallbacks.set(id, callback);
      callbacks.set(destination, destinationCallbacks);
      frames.push(`SUBSCRIBE ${destination}`);

      const subscription: StompSubscription = {
        id,
        unsubscribe() {
          frames.push(`UNSUBSCRIBE ${destination}`);
          destinationCallbacks.delete(id);
        },
      };

      return subscription;
    }),
  };

  return client;
}
