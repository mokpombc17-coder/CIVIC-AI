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

    expect(portA.lastEvent()?.snapshot.status).toBe("connected");
    expect(portB.lastEvent()?.snapshot.status).toBe("connected");
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
    expect(portB.lastEvent()?.attachedPortCount).toBe(1);

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
    expect(port.lastEvent()?.snapshot).toEqual({
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

    expect(portB.lastEvent()?.snapshot.status).toBe("connecting");
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

    expect(port.lastEvent()?.snapshot).toEqual({
      status: "error",
      error: {
        source: "stomp",
        message: "Access denied",
      },
    });

    client.onWebSocketClose({ reason: "network lost" } as CloseEvent);

    expect(port.lastEvent()?.snapshot).toEqual({
      status: "reconnecting",
      error: {
        source: "websocket",
        message: "network lost",
      },
    });
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
