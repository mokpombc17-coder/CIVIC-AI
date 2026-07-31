import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSharedWorkerCommand, ChatSharedWorkerEvent } from "./chat-shared-worker-protocol";
import {
  SharedWorkerTransport,
  type SharedWorkerTransportMessageListener,
  type SharedWorkerTransportPort,
  type SharedWorkerTransportWorker,
} from "./shared-worker-transport";

afterEach(() => {
  vi.useRealTimers();
});

describe("SharedWorkerTransport availability", () => {
  it("생성자가 실패하면 unavailable을 즉시 보고한다", () => {
    const onWorkerUnavailable = vi.fn();
    const transport = new SharedWorkerTransport({
      createWorker: () => {
        throw new Error("CSP blocked");
      },
      onWorkerUnavailable,
    });

    transport.attach();

    expect(onWorkerUnavailable).toHaveBeenCalledTimes(1);
    expect(onWorkerUnavailable.mock.calls[0]?.[0]).toMatchObject({
      source: "worker",
      message: "CSP blocked",
    });
  });

  it("초기 handshake 응답이 없으면 timeout 후 unavailable을 보고한다", () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const onWorkerUnavailable = vi.fn();
    const transport = new SharedWorkerTransport({
      createWorker: () => worker,
      handshakeTimeoutMs: 100,
      onWorkerUnavailable,
    });

    transport.attach();
    vi.advanceTimersByTime(100);

    expect(onWorkerUnavailable).toHaveBeenCalledTimes(1);
    expect(worker.port.closed).toBe(true);
  });

  it("유효한 worker event를 받으면 handshake timeout을 해제한다", () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const onWorkerReady = vi.fn();
    const onWorkerUnavailable = vi.fn();
    const transport = new SharedWorkerTransport({
      createWorker: () => worker,
      handshakeTimeoutMs: 100,
      onWorkerReady,
      onWorkerUnavailable,
    });

    transport.attach();
    worker.port.emit({
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: "worker-1",
      attachedPortCount: 1,
      snapshot: {
        status: "connecting",
        error: null,
      },
    });
    vi.advanceTimersByTime(100);

    expect(onWorkerReady).toHaveBeenCalledTimes(1);
    expect(onWorkerUnavailable).not.toHaveBeenCalled();
    expect(worker.port.closed).toBe(false);
  });
});

class FakeWorker implements SharedWorkerTransportWorker {
  readonly port = new FakePort();

  addEventListener(): void {}

  removeEventListener(): void {}
}

class FakePort implements SharedWorkerTransportPort {
  closed = false;
  readonly commands: ChatSharedWorkerCommand[] = [];
  private readonly listeners = new Set<SharedWorkerTransportMessageListener>();

  addEventListener(
    type: "message" | "messageerror",
    listener: SharedWorkerTransportMessageListener,
  ): void {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  close(): void {
    this.closed = true;
  }

  emit(event: ChatSharedWorkerEvent): void {
    const message = { data: event } as MessageEvent<unknown>;
    this.listeners.forEach((listener) => listener(message));
  }

  postMessage(command: ChatSharedWorkerCommand): void {
    this.commands.push(command);
  }

  removeEventListener(
    type: "message" | "messageerror",
    listener: SharedWorkerTransportMessageListener,
  ): void {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  start(): void {}
}
