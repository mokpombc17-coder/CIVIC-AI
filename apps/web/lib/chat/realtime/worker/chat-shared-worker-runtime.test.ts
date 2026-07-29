import type { IFrame } from "@stomp/stompjs";
import { describe, expect, it, vi } from "vitest";
import type {
  ChatSharedWorkerCommand,
  ChatSharedWorkerEvent,
} from "../chat-shared-worker-protocol";
import {
  ChatSharedWorkerRuntime,
  type ChatSharedWorkerPort,
  type ChatSharedWorkerStompClient,
} from "./chat-shared-worker-runtime";

describe("ChatSharedWorkerRuntime", () => {
  it("여러 port가 붙어도 STOMP Client를 한 번만 활성화하고 snapshot을 공유한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client, "worker-1");
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });

    expect(portA.start).toHaveBeenCalledTimes(1);
    expect(portB.start).toHaveBeenCalledTimes(1);
    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(portA.lastEvent()).toMatchObject({
      workerInstanceId: "worker-1",
      attachedPortCount: 2,
      snapshot: { status: "connecting", error: null },
    });

    client.onConnect({} as IFrame);

    expect(portA.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot.status).toBe("connected");
    expect(portB.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot.status).toBe("connected");
  });

  it("마지막 port가 떨어질 때만 STOMP Client를 비활성화한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });

    portA.send({ type: "DETACH", portId: "port-a" });

    expect(client.deactivate).not.toHaveBeenCalled();
    expect(portA.close).toHaveBeenCalledTimes(1);
    expect(portB.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.attachedPortCount).toBe(1);

    portB.send({ type: "DETACH", portId: "port-b" });

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(portB.close).toHaveBeenCalledTimes(1);
  });

  it("활성 연결에는 forceDisconnect로 재연결을 요청한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-1" });
    port.send({ type: "RECONNECT", portId: "port-1" });

    expect(client.forceDisconnect).toHaveBeenCalledTimes(1);
    expect(port.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual({
      status: "reconnecting",
      error: null,
    });
  });

  it("deactivate 도중 새 port가 붙으면 종료 완료 후 STOMP Client를 다시 활성화한다", async () => {
    const deactivation = createDeferred<void>();
    const client = createFakeStompClient();
    client.deactivate.mockImplementation(async () => {
      await deactivation.promise;
      client.setActive(false);
    });
    const runtime = new ChatSharedWorkerRuntime(client);
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portA.send({ type: "DETACH", portId: "port-a" });
    runtime.connectPort(portB);
    portB.send({ type: "ATTACH", portId: "port-b" });

    expect(portB.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot.status).toBe("connecting");
    expect(client.activate).toHaveBeenCalledTimes(1);

    deactivation.resolve();
    await deactivation.promise;
    await Promise.resolve();

    expect(client.activate).toHaveBeenCalledTimes(2);
  });

  it("STOMP와 WebSocket 오류를 직렬화 가능한 snapshot으로 변환한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-1" });
    client.onStompError({
      headers: { message: "Access denied" },
      body: "",
    } as unknown as IFrame);

    expect(port.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual({
      status: "error",
      error: {
        source: "stomp",
        message: "Access denied",
      },
    });

    client.onWebSocketClose({ reason: "network lost" } as CloseEvent);

    expect(port.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual({
      status: "reconnecting",
      error: {
        source: "websocket",
        message: "network lost",
      },
    });
  });

  it("첫 방 claim을 활성 lease로 만들고 같은 owner의 중복 claim은 generation을 유지한다", () => {
    const runtime = new ChatSharedWorkerRuntime(createFakeStompClient());
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "request-1",
      roomId: "room-01",
    });
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "request-2",
      roomId: "room-01",
    });

    expect(port.eventsOfType("ROOM_ACTIVATED")).toEqual([
      {
        type: "ROOM_ACTIVATED",
        requestId: "request-1",
        roomId: "room-01",
        generation: 1,
      },
      {
        type: "ROOM_ACTIVATED",
        requestId: "request-2",
        roomId: "room-01",
        generation: 1,
      },
    ]);
  });

  it("같은 방을 다른 port가 claim하면 구독 세대를 바꾸고 이전 owner를 교체한다", () => {
    const runtime = new ChatSharedWorkerRuntime(createFakeStompClient());
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    portA.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "request-a",
      roomId: "room-01",
    });
    portB.send({
      type: "CLAIM_ROOM",
      portId: "port-b",
      requestId: "request-b",
      roomId: "room-01",
    });

    expect(portA.eventsOfType("ROOM_REPLACED")).toEqual([
      {
        type: "ROOM_REPLACED",
        roomId: "room-01",
        activatedRoomId: "room-01",
        generation: 2,
      },
    ]);
    expect(portB.eventsOfType("ROOM_ACTIVATED").at(-1)).toEqual({
      type: "ROOM_ACTIVATED",
      requestId: "request-b",
      roomId: "room-01",
      generation: 2,
    });
  });

  it("다른 방 claim은 이전 owner를 교체하고 오래된 release가 새 lease를 해제하지 못한다", () => {
    const runtime = new ChatSharedWorkerRuntime(createFakeStompClient());
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    portA.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-a",
      roomId: "room-01",
    });
    portB.send({
      type: "CLAIM_ROOM",
      portId: "port-b",
      requestId: "claim-b",
      roomId: "room-02",
    });
    portA.send({
      type: "RELEASE_ROOM",
      portId: "port-a",
      requestId: "release-a",
      roomId: "room-01",
    });
    portB.send({
      type: "CLAIM_ROOM",
      portId: "port-b",
      requestId: "claim-b-again",
      roomId: "room-02",
    });

    expect(portA.eventsOfType("ROOM_REPLACED").at(-1)).toEqual({
      type: "ROOM_REPLACED",
      roomId: "room-01",
      activatedRoomId: "room-02",
      generation: 2,
    });
    expect(portA.eventsOfType("ROOM_RELEASED").at(-1)?.generation).toBe(2);
    expect(portB.eventsOfType("ROOM_ACTIVATED").at(-1)?.generation).toBe(2);
  });

  it("owner release와 detach는 lease를 해제하고 다음 claim에 새 generation을 부여한다", () => {
    const runtime = new ChatSharedWorkerRuntime(createFakeStompClient());
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    portA.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-a",
      roomId: "room-01",
    });
    portA.send({
      type: "RELEASE_ROOM",
      portId: "port-a",
      requestId: "release-a",
      roomId: "room-01",
    });
    portB.send({
      type: "CLAIM_ROOM",
      portId: "port-b",
      requestId: "claim-b",
      roomId: "room-02",
    });
    portB.send({ type: "DETACH", portId: "port-b" });
    portA.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-a-again",
      roomId: "room-01",
    });

    expect(portA.eventsOfType("ROOM_RELEASED").at(-1)?.generation).toBe(2);
    expect(portB.eventsOfType("ROOM_ACTIVATED").at(-1)?.generation).toBe(3);
    expect(portA.eventsOfType("ROOM_ACTIVATED").at(-1)?.generation).toBe(5);
  });

  it("유효하지 않은 roomId는 lease를 바꾸지 않고 요청 port에만 오류를 보낸다", () => {
    const runtime = new ChatSharedWorkerRuntime(createFakeStompClient());
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "invalid",
      roomId: "invalid room",
    });
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "valid",
      roomId: "room-01",
    });

    expect(port.eventsOfType("ROOM_ACTIVATION_FAILED").at(-1)).toMatchObject({
      requestId: "invalid",
      code: "INVALID_ROOM_ID",
    });
    expect(port.eventsOfType("ROOM_ACTIVATED").at(-1)?.generation).toBe(1);
  });
});

type FakeStompClient = ChatSharedWorkerStompClient & {
  activate: ReturnType<typeof vi.fn<() => void>>;
  deactivate: ReturnType<typeof vi.fn<() => Promise<void>>>;
  forceDisconnect: ReturnType<typeof vi.fn<() => void>>;
  setActive(value: boolean): void;
};

function createFakeStompClient(): FakeStompClient {
  let active = false;

  return {
    get active() {
      return active;
    },
    activate: vi.fn(() => {
      active = true;
    }),
    deactivate: vi.fn(async () => {
      active = false;
    }),
    forceDisconnect: vi.fn(),
    onConnect: vi.fn(),
    onStompError: vi.fn(),
    onWebSocketClose: vi.fn(),
    onWebSocketError: vi.fn(),
    setActive(value) {
      active = value;
    },
  };
}

type FakePort = ChatSharedWorkerPort & {
  close: ReturnType<typeof vi.fn<() => void>>;
  eventsOfType<T extends ChatSharedWorkerEvent["type"]>(
    type: T,
  ): Extract<ChatSharedWorkerEvent, { type: T }>[];
  lastEvent(): ChatSharedWorkerEvent | undefined;
  send(command: ChatSharedWorkerCommand): void;
  start: ReturnType<typeof vi.fn<() => void>>;
};

function createFakePort(): FakePort {
  const events: ChatSharedWorkerEvent[] = [];
  const messageListeners = new Set<(event: MessageEvent<unknown>) => void>();

  return {
    addEventListener(_type, listener) {
      messageListeners.add(listener);
    },
    close: vi.fn(),
    eventsOfType(type) {
      return events.filter(
        (event): event is Extract<ChatSharedWorkerEvent, { type: typeof type }> =>
          event.type === type,
      );
    },
    lastEvent() {
      return events.at(-1);
    },
    postMessage(event) {
      events.push(event);
    },
    removeEventListener(_type, listener) {
      messageListeners.delete(listener);
    },
    send(command) {
      const event = { data: command } as MessageEvent<unknown>;
      messageListeners.forEach((listener) => listener(event));
    },
    start: vi.fn(),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
