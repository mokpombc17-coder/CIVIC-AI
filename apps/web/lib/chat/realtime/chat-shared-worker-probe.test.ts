import { describe, expect, it, vi } from "vitest";
import {
  attachChatSharedWorkerProbe,
  isChatSharedWorkerProbeEnabled,
} from "./chat-shared-worker-probe";

describe("isChatSharedWorkerProbeEnabled", () => {
  it("명시적인 probe query 값만 활성화한다", () => {
    expect(isChatSharedWorkerProbeEnabled("?chatWorkerProbe=1")).toBe(true);
    expect(isChatSharedWorkerProbeEnabled("?chatWorkerProbe=true")).toBe(true);
    expect(isChatSharedWorkerProbeEnabled("?chatWorkerProbe=0")).toBe(false);
    expect(isChatSharedWorkerProbeEnabled("")).toBe(false);
  });
});

describe("attachChatSharedWorkerProbe", () => {
  it("port를 시작하고 attach한 뒤 cleanup에서 한 번만 detach한다", () => {
    const port = createFakePort();
    const onSnapshot = vi.fn();
    const detach = attachChatSharedWorkerProbe({
      createId: () => "probe-1",
      createWorker: () => ({ port }),
      onSnapshot,
    });

    expect(port.start).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenNthCalledWith(1, {
      type: "PROBE_ATTACH",
      probeId: "probe-1",
    });

    port.dispatchMessage({
      type: "PROBE_SNAPSHOT",
      probeId: "another-probe",
      workerInstanceId: "worker-1",
      portConnectionId: "port-1",
      connectedPortCount: 2,
    });
    expect(onSnapshot).not.toHaveBeenCalled();

    const snapshot = {
      type: "PROBE_SNAPSHOT" as const,
      probeId: "probe-1",
      workerInstanceId: "worker-1",
      portConnectionId: "port-1",
      connectedPortCount: 2,
    };
    port.dispatchMessage(snapshot);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);

    detach();
    detach();

    expect(port.postMessage).toHaveBeenNthCalledWith(2, {
      type: "PROBE_DETACH",
      probeId: "probe-1",
    });
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("SharedWorker 생성 실패를 호출자에게 보고하고 안전한 cleanup을 반환한다", () => {
    const error = new Error("SharedWorker unavailable");
    const onError = vi.fn();

    const detach = attachChatSharedWorkerProbe({
      createWorker: () => {
        throw error;
      },
      onError,
    });

    expect(onError).toHaveBeenCalledWith(error);
    expect(detach).not.toThrow();
  });
});

function createFakePort() {
  const messageListeners = new Set<(event: MessageEvent<unknown>) => void>();

  return {
    addEventListener: vi.fn((type: string, listener: (event: MessageEvent<unknown>) => void) => {
      if (type === "message") {
        messageListeners.add(listener);
      }
    }),
    close: vi.fn(() => {}),
    dispatchMessage(data: unknown) {
      const event = { data } as MessageEvent<unknown>;
      messageListeners.forEach((listener) => listener(event));
    },
    postMessage: vi.fn<(message: unknown) => void>(),
    removeEventListener: vi.fn((type: string, listener: (event: MessageEvent<unknown>) => void) => {
      if (type === "message") {
        messageListeners.delete(listener);
      }
    }),
    start: vi.fn(() => {}),
  } satisfies ChatSharedWorkerProbePortForTest;
}

type ChatSharedWorkerProbePortForTest = {
  addEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  dispatchMessage(data: unknown): void;
  postMessage: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
};
