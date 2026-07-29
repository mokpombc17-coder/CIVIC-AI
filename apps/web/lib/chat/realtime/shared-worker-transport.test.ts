import { describe, expect, it, vi } from "vitest";
import type { ChatSharedWorkerCommand, ChatSharedWorkerEvent } from "./chat-shared-worker-protocol";
import { SharedWorkerTransport } from "./shared-worker-transport";

describe("SharedWorkerTransport", () => {
  it("첫 consumer에서 port를 attach하고 마지막 consumer에서 한 번만 detach한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker: () => worker,
    });

    const detachFirst = transport.attach();
    const detachSecond = transport.attach();

    expect(worker.port.start).toHaveBeenCalledTimes(1);
    expect(worker.port.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.port.postMessage).toHaveBeenCalledWith({
      type: "ATTACH",
      portId: "port-1",
    });

    detachFirst();
    expect(worker.port.close).not.toHaveBeenCalled();

    detachSecond();
    detachSecond();

    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "DETACH",
      portId: "port-1",
    });
    expect(worker.port.close).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toEqual({
      status: "disconnected",
      error: null,
    });
  });

  it("Worker snapshot을 외부 store 상태로 반영하고 reconnect 명령을 전달한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker: () => worker,
    });
    const listener = vi.fn();

    transport.observe(listener);
    transport.attach();
    worker.port.dispatchMessage({
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: "worker-1",
      attachedPortCount: 1,
      snapshot: {
        status: "connected",
        error: null,
      },
    });
    transport.reconnect();

    expect(transport.getSnapshot()).toEqual({
      status: "connected",
      error: null,
    });
    expect(listener).toHaveBeenCalled();
    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "RECONNECT",
      portId: "port-1",
    });
  });

  it("React effect가 다시 attach되면 새 port로 안전하게 연결한다", () => {
    const workers = [createFakeWorker(), createFakeWorker()];
    const createWorker = vi.fn(() => workers.shift()!);
    const createId = vi.fn().mockReturnValueOnce("port-1").mockReturnValueOnce("port-2");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker,
    });

    transport.attach()();
    transport.attach();

    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(workers).toHaveLength(0);
  });

  it("Worker 생성 오류를 보고하고 reconnect에서 생성을 다시 시도한다", () => {
    const createWorker = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("worker blocked");
      })
      .mockImplementationOnce(() => createFakeWorker());
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker,
    });

    transport.attach();

    expect(transport.getSnapshot()).toEqual({
      status: "error",
      error: {
        source: "worker",
        message: "worker blocked",
      },
    });

    transport.reconnect();
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("실행 중 Worker 오류가 나면 기존 port를 detach하고 오류 상태를 유지한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker: () => worker,
    });

    transport.attach();
    worker.dispatchError();

    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "DETACH",
      portId: "port-1",
    });
    expect(worker.port.close).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toEqual({
      status: "error",
      error: {
        source: "worker",
        message: "SharedWorker 실행 중 오류가 발생했습니다.",
      },
    });
  });

  it("port 명령 전송 실패 시 연결을 정리하고 Worker 오류로 노출한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker: () => worker,
    });

    transport.attach();
    worker.port.postMessage.mockImplementationOnce(() => {
      throw new Error("port closed");
    });
    transport.reconnect();

    expect(worker.port.close).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toEqual({
      status: "error",
      error: {
        source: "worker",
        message: "port closed",
      },
    });
  });

  it("방 claim 결과와 owner 교체 이벤트를 탭의 room snapshot으로 변환한다", () => {
    const worker = createFakeWorker();
    const createId = vi
      .fn()
      .mockReturnValueOnce("port-1")
      .mockReturnValueOnce("claim-1")
      .mockReturnValueOnce("claim-2");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker: () => worker,
    });
    const roomListener = vi.fn();

    transport.observeRoom(roomListener);
    transport.attach();
    transport.claimRoom("room-01");

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "claiming",
      roomId: "room-01",
    });
    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "CLAIM_ROOM",
      portId: "port-1",
      requestId: "claim-1",
      roomId: "room-01",
    });

    worker.port.dispatchMessage({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
    });
    expect(transport.getRoomSnapshot()).toEqual({
      status: "active",
      roomId: "room-01",
      generation: 1,
      replacedByRoomId: null,
      error: null,
    });

    worker.port.dispatchMessage({
      type: "ROOM_REPLACED",
      roomId: "room-01",
      activatedRoomId: "room-02",
      generation: 2,
    });
    expect(transport.getRoomSnapshot()).toEqual({
      status: "replaced",
      roomId: "room-01",
      generation: 2,
      replacedByRoomId: "room-02",
      error: null,
    });
    expect(roomListener).toHaveBeenCalled();
  });

  it("새 claim 이후 늦게 도착한 이전 응답은 room snapshot에 반영하지 않는다", () => {
    const worker = createFakeWorker();
    const createId = vi
      .fn()
      .mockReturnValueOnce("port-1")
      .mockReturnValueOnce("claim-1")
      .mockReturnValueOnce("claim-2");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker: () => worker,
    });

    transport.attach();
    transport.claimRoom("room-01");
    transport.claimRoom("room-02");
    worker.port.dispatchMessage({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
    });

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "claiming",
      roomId: "room-02",
    });

    worker.port.dispatchMessage({
      type: "ROOM_ACTIVATED",
      requestId: "claim-2",
      roomId: "room-02",
      generation: 2,
    });
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "active",
      roomId: "room-02",
      generation: 2,
    });
  });

  it("현재 방 release만 local snapshot을 해제하고 오래된 release 응답은 무시한다", () => {
    const worker = createFakeWorker();
    const createId = vi
      .fn()
      .mockReturnValueOnce("port-1")
      .mockReturnValueOnce("claim-1")
      .mockReturnValueOnce("stale-release")
      .mockReturnValueOnce("release-2");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker: () => worker,
    });

    transport.attach();
    transport.claimRoom("room-02");
    worker.port.dispatchMessage({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-02",
      generation: 2,
    });

    transport.releaseRoom("room-01");
    worker.port.dispatchMessage({
      type: "ROOM_RELEASED",
      requestId: "stale-release",
      roomId: "room-01",
      generation: 2,
    });
    expect(transport.getRoomSnapshot().status).toBe("active");

    transport.releaseRoom("room-02");
    worker.port.dispatchMessage({
      type: "ROOM_RELEASED",
      requestId: "release-2",
      roomId: "room-02",
      generation: 3,
    });
    expect(transport.getRoomSnapshot()).toEqual({
      status: "idle",
      roomId: null,
      generation: 3,
      replacedByRoomId: null,
      error: null,
    });
  });

  it("방 명령을 보낼 port가 없으면 room session 오류를 노출한다", () => {
    const transport = new SharedWorkerTransport({
      createId: () => "request-1",
      createWorker: () => createFakeWorker(),
    });

    transport.claimRoom("room-01");

    expect(transport.getRoomSnapshot()).toEqual({
      status: "error",
      roomId: "room-01",
      generation: 0,
      replacedByRoomId: null,
      error: {
        code: "WORKER_UNAVAILABLE",
        message: "SharedWorker port가 연결되어 있지 않습니다.",
      },
    });
  });

  it("서버의 방 구독 거절을 room session 오류로 보존한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker: () => worker,
    });

    transport.attach();
    worker.port.dispatchMessage({
      type: "ROOM_SUBSCRIPTION_FAILED",
      roomId: "room-01",
      generation: 4,
      code: "ACTIVE_ROOM_LIMIT_EXCEEDED",
      message: "서버가 방 구독을 거절했습니다.",
    });

    expect(transport.getRoomSnapshot()).toEqual({
      status: "error",
      roomId: "room-01",
      generation: 4,
      replacedByRoomId: null,
      error: {
        code: "SUBSCRIPTION_REJECTED",
        serverCode: "ACTIVE_ROOM_LIMIT_EXCEEDED",
        message: "서버가 방 구독을 거절했습니다.",
      },
    });
  });
});

type FakePort = {
  addEventListener(
    type: "message" | "messageerror",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  close: ReturnType<typeof vi.fn<() => void>>;
  dispatchMessage(event: ChatSharedWorkerEvent): void;
  postMessage: ReturnType<typeof vi.fn<(command: ChatSharedWorkerCommand) => void>>;
  removeEventListener(
    type: "message" | "messageerror",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  start: ReturnType<typeof vi.fn<() => void>>;
};

type FakeWorker = {
  addEventListener(type: "error", listener: (event: Event) => void): void;
  dispatchError(): void;
  port: FakePort;
  removeEventListener(type: "error", listener: (event: Event) => void): void;
};

function createFakeWorker(): FakeWorker {
  const errorListeners = new Set<(event: Event) => void>();
  const messageListeners = new Set<(event: MessageEvent<unknown>) => void>();
  const port: FakePort = {
    addEventListener(type, listener) {
      if (type === "message") {
        messageListeners.add(listener);
      }
    },
    close: vi.fn(),
    dispatchMessage(event) {
      const messageEvent = { data: event } as MessageEvent<unknown>;
      messageListeners.forEach((listener) => listener(messageEvent));
    },
    postMessage: vi.fn(),
    removeEventListener(type, listener) {
      if (type === "message") {
        messageListeners.delete(listener);
      }
    },
    start: vi.fn(),
  };

  return {
    addEventListener(_type, listener) {
      errorListeners.add(listener);
    },
    dispatchError() {
      errorListeners.forEach((listener) => listener(new Event("error")));
    },
    port,
    removeEventListener(_type, listener) {
      errorListeners.delete(listener);
    },
  };
}
