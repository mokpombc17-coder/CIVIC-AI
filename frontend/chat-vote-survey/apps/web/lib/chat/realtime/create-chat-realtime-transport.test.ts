import { describe, expect, it, vi } from "vitest";
import type { ChatMessageDeliveryLifecycleEvent } from "./chat-message-delivery-scheduler";
import type { ChatRealtimeTransport, ChatRoomSessionSnapshot } from "./chat-realtime-transport";
import type { ChatRealtimeTransportCandidateLifecycle } from "./fallback-chat-realtime-transport";
import { createChatRealtimeTransport } from "./create-chat-realtime-transport";

describe("createChatRealtimeTransport", () => {
  it("SharedWorker가 준비되면 SharedWorker transport를 유지한다", () => {
    const shared = createFakeTransport();
    const leader = createFakeTransport();
    const direct = createFakeTransport();
    let lifecycle: ChatRealtimeTransportCandidateLifecycle | null = null;

    const transport = createChatRealtimeTransport({
      supportsSharedWorker: true,
      supportsLeaderTab: true,
      createSharedWorkerTransport: (value) => {
        lifecycle = value;
        return shared;
      },
      createLeaderTabTransport: () => leader,
      createDirectTransport: () => direct,
    });

    const detach = transport.attach();
    lifecycle!.onReady();

    expect(shared.attach).toHaveBeenCalledTimes(1);
    expect(leader.attach).not.toHaveBeenCalled();
    expect(direct.attach).not.toHaveBeenCalled();

    detach();
    expect(shared.detach).toHaveBeenCalledTimes(1);
  });

  it("SharedWorker 초기화 실패 시 LeaderTab transport로 강등한다", async () => {
    const shared = createFakeTransport();
    const leader = createFakeTransport();
    const direct = createFakeTransport();
    let sharedLifecycle: ChatRealtimeTransportCandidateLifecycle | null = null;

    const transport = createChatRealtimeTransport({
      supportsSharedWorker: true,
      supportsLeaderTab: true,
      createSharedWorkerTransport: (lifecycle) => {
        sharedLifecycle = lifecycle;
        return shared;
      },
      createLeaderTabTransport: () => leader,
      createDirectTransport: () => direct,
    });

    transport.attach();
    transport.claimRoom("room-1");
    sharedLifecycle!.onUnavailable();
    await flushMicrotasks();

    expect(shared.detach).toHaveBeenCalledTimes(1);
    expect(leader.attach).toHaveBeenCalledTimes(1);
    expect(leader.claimRoom).toHaveBeenCalledWith("room-1");
    expect(direct.attach).not.toHaveBeenCalled();
  });

  it("SharedWorker와 LeaderTab 초기화가 모두 실패하면 Direct transport를 사용한다", async () => {
    const shared = createFakeTransport();
    const leader = createFakeTransport();
    const direct = createFakeTransport();
    let sharedLifecycle: ChatRealtimeTransportCandidateLifecycle | null = null;
    let leaderLifecycle: ChatRealtimeTransportCandidateLifecycle | null = null;

    const transport = createChatRealtimeTransport({
      supportsSharedWorker: true,
      supportsLeaderTab: true,
      createSharedWorkerTransport: (lifecycle) => {
        sharedLifecycle = lifecycle;
        return shared;
      },
      createLeaderTabTransport: (lifecycle) => {
        leaderLifecycle = lifecycle;
        return leader;
      },
      createDirectTransport: () => direct,
    });

    transport.attach();
    sharedLifecycle!.onUnavailable();
    await flushMicrotasks();
    leaderLifecycle!.onUnavailable();
    await flushMicrotasks();

    expect(shared.detach).toHaveBeenCalledTimes(1);
    expect(leader.detach).toHaveBeenCalledTimes(1);
    expect(direct.attach).toHaveBeenCalledTimes(1);
  });

  it("SharedWorker가 없고 LeaderTab 기능이 있으면 LeaderTab transport부터 사용한다", () => {
    const leader = createFakeTransport();
    const direct = createFakeTransport();

    const transport = createChatRealtimeTransport({
      supportsSharedWorker: false,
      supportsLeaderTab: true,
      createLeaderTabTransport: () => leader,
      createDirectTransport: () => direct,
    });

    transport.attach();

    expect(leader.attach).toHaveBeenCalledTimes(1);
    expect(direct.attach).not.toHaveBeenCalled();
  });

  it("탭 조정 기능도 없을 때만 Direct transport를 사용한다", () => {
    const direct = createFakeTransport();

    const transport = createChatRealtimeTransport({
      supportsSharedWorker: false,
      supportsLeaderTab: false,
      createDirectTransport: () => direct,
    });

    transport.attach();

    expect(direct.attach).toHaveBeenCalledTimes(1);
  });

  it("transport 생성 자체가 실패해도 다음 후보를 선택한다", () => {
    const leader = createFakeTransport();

    const transport = createChatRealtimeTransport({
      supportsSharedWorker: true,
      supportsLeaderTab: true,
      createSharedWorkerTransport: () => {
        throw new Error("CSP blocked");
      },
      createLeaderTabTransport: () => leader,
    });

    transport.attach();

    expect(leader.attach).toHaveBeenCalledTimes(1);
  });

  it("현재 후보 transport의 메시지 delivery lifecycle만 중계한다", async () => {
    const shared = createFakeTransport();
    const leader = createFakeTransport();
    let sharedLifecycle: ChatRealtimeTransportCandidateLifecycle | null = null;
    const transport = createChatRealtimeTransport({
      supportsSharedWorker: true,
      supportsLeaderTab: true,
      createSharedWorkerTransport: (lifecycle) => {
        sharedLifecycle = lifecycle;
        return shared;
      },
      createLeaderTabTransport: () => leader,
    });
    const listener = vi.fn();
    const event: ChatMessageDeliveryLifecycleEvent = {
      attempt: 1,
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      generation: 1,
      reason: null,
      retryAt: null,
      roomId: "room-01",
      status: "sending",
    };

    transport.observeMessageDeliveryLifecycle(listener);
    transport.attach();
    shared.emitMessageDeliveryLifecycle(event);
    sharedLifecycle!.onUnavailable();
    await flushMicrotasks();
    shared.emitMessageDeliveryLifecycle({ ...event, status: "sent" });
    leader.emitMessageDeliveryLifecycle({ ...event, status: "retry-waiting", retryAt: 1_000 });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([value]) => value.status)).toEqual([
      "sending",
      "retry-waiting",
    ]);
  });
});

function createFakeTransport(): ChatRealtimeTransport & {
  attach: ReturnType<typeof vi.fn>;
  claimRoom: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  emitMessageDeliveryLifecycle(event: ChatMessageDeliveryLifecycleEvent): void;
} {
  const detach = vi.fn();
  const attach = vi.fn(() => detach);
  const claimRoom = vi.fn();
  const messageDeliveryLifecycleListeners = new Set<
    (event: ChatMessageDeliveryLifecycleEvent) => void
  >();
  const roomSnapshot: ChatRoomSessionSnapshot = {
    status: "idle",
    roomId: null,
    generation: 0,
    replacedByRoomId: null,
    messageVisibleAfterSequence: null,
    watermarkSequence: null,
    error: null,
  };

  return {
    acknowledgeRealtimeEventDelivery: () => {},
    attach,
    claimRoom,
    clearDiagnostics: () => Promise.resolve(),
    deleteRoomMessage: () => {},
    detach,
    editRoomMessage: () => {},
    confirmRoomReadState: () => {},
    emitMessageDeliveryLifecycle(event) {
      messageDeliveryLifecycleListeners.forEach((listener) => listener(event));
    },
    getDiagnosticSnapshot: () =>
      Promise.reject(new Error("Diagnostics are not used in this test.")),
    getRealtimeEventDelivery: () => null,
    getPrincipalGeneration: () => 0,
    getRoomSnapshot: () => roomSnapshot,
    getSnapshot: () => ({ status: "idle", error: null }),
    markRoomSnapshotApplied: () => {},
    observeMessageCommandEvent: () => () => {},
    observeMessageDeliveryLifecycle: (listener) => {
      messageDeliveryLifecycleListeners.add(listener);
      return () => messageDeliveryLifecycleListeners.delete(listener);
    },
    observeMessageMutationLifecycle: () => () => {},
    observeMessageMutationEvent: () => () => {},
    observeRealtimeEventDelivery: () => () => {},
    observePrincipalGeneration: () => () => {},
    observeRoomReadStateConfirmation: () => () => {},
    observeRoom: () => () => {},
    observeRoomInboxEvent: () => () => {},
    observe: () => () => {},
    reconnect: () => {},
    releaseRoom: () => {},
    sendRoomMessage: () => {},
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
