import { describe, expect, it, vi } from "vitest";
import type { ChatRealtimeTransport } from "./chat-realtime-transport";
import { createChatRealtimeTransport } from "./create-chat-realtime-transport";

describe("createChatRealtimeTransport", () => {
  it("SharedWorker 지원 환경에서는 SharedWorker transport를 선택한다", () => {
    const sharedWorkerTransport = createFakeTransport();
    const createSharedWorkerTransport = vi.fn(() => sharedWorkerTransport);
    const createDirectTransport = vi.fn(createFakeTransport);

    const result = createChatRealtimeTransport({
      supportsSharedWorker: true,
      createSharedWorkerTransport,
      createDirectTransport,
    });

    expect(result).toBe(sharedWorkerTransport);
    expect(createSharedWorkerTransport).toHaveBeenCalledTimes(1);
    expect(createDirectTransport).not.toHaveBeenCalled();
  });

  it("SharedWorker 미지원 환경에서만 Direct transport를 선택한다", () => {
    const directTransport = createFakeTransport();
    const createSharedWorkerTransport = vi.fn(createFakeTransport);
    const createDirectTransport = vi.fn(() => directTransport);

    const result = createChatRealtimeTransport({
      supportsSharedWorker: false,
      createSharedWorkerTransport,
      createDirectTransport,
    });

    expect(result).toBe(directTransport);
    expect(createDirectTransport).toHaveBeenCalledTimes(1);
    expect(createSharedWorkerTransport).not.toHaveBeenCalled();
  });
});

function createFakeTransport(): ChatRealtimeTransport {
  return {
    acknowledgeRealtimeEventDelivery: () => {},
    attach: () => () => {},
    claimRoom: () => {},
    getRealtimeEventDelivery: () => null,
    getRoomSnapshot: () => ({
      status: "idle",
      roomId: null,
      generation: 0,
      replacedByRoomId: null,
      watermarkSequence: null,
      error: null,
    }),
    getSnapshot: () => ({ status: "idle", error: null }),
    markRoomSnapshotApplied: () => {},
    observeMessageCommandEvent: () => () => {},
    observeRealtimeEventDelivery: () => () => {},
    observeRoom: () => () => {},
    observe: () => () => {},
    reconnect: () => {},
    releaseRoom: () => {},
    sendRoomMessage: () => {},
  };
}
