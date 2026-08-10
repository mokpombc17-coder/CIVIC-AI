import { describe, expect, it, vi } from "vitest";
import type { ChatSharedWorkerCommand, ChatSharedWorkerEvent } from "./chat-shared-worker-protocol";
import { SharedWorkerTransport } from "./shared-worker-transport";

describe("SharedWorkerTransport", () => {
  it("진단 snapshot과 clear 요청을 requestId로 연결한다", async () => {
    const worker = createFakeWorker();
    let requestSequence = 0;
    const transport = new SharedWorkerTransport({
      createDiagnosticRequestId: () => `diagnostics-${++requestSequence}`,
      createId: () => "port-1",
      createWorker: () => worker,
    });
    const snapshot = {
      schemaVersion: 1 as const,
      capturedAt: "2026-08-05T00:00:00.000Z",
      capacity: 500,
      droppedEventCount: 0,
      rejectedEventCount: 0,
      events: [],
    };

    transport.attach();
    const snapshotPromise = transport.getDiagnosticSnapshot();

    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "GET_DIAGNOSTICS",
      portId: "port-1",
      requestId: "diagnostics-1",
    });
    worker.port.dispatchMessage({
      type: "DIAGNOSTICS_SNAPSHOT",
      requestId: "diagnostics-1",
      snapshot,
    });
    await expect(snapshotPromise).resolves.toEqual(snapshot);

    const clearPromise = transport.clearDiagnostics();
    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "CLEAR_DIAGNOSTICS",
      portId: "port-1",
      requestId: "diagnostics-2",
    });
    worker.port.dispatchMessage({
      type: "DIAGNOSTICS_CLEARED",
      requestId: "diagnostics-2",
    });
    await expect(clearPromise).resolves.toBeUndefined();
  });

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
      principalGeneration: 0,
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

    transport.reconnect("authentication-succeeded");
    expect(transport.getPrincipalGeneration()).toBe(1);
    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "RECONNECT",
      portId: "port-1",
      reason: "authentication-succeeded",
    });
  });

  it("worker 인증 세대에 귀속해 read-state confirmation을 송수신한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker: () => worker,
    });
    const generationListener = vi.fn();
    const confirmationListener = vi.fn();

    transport.observePrincipalGeneration(generationListener);
    transport.observeRoomReadStateConfirmation(confirmationListener);
    transport.attach();
    worker.port.dispatchMessage({
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: "worker-1",
      attachedPortCount: 1,
      principalGeneration: 3,
      snapshot: { status: "connected", error: null },
    });
    transport.confirmRoomReadState("room-1", 13);

    expect(transport.getPrincipalGeneration()).toBe(3);
    expect(generationListener).toHaveBeenCalledOnce();
    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "CONFIRM_ROOM_READ_STATE",
      portId: "port-1",
      principalGeneration: 3,
      roomId: "room-1",
      readThroughSequence: 13,
    });

    worker.port.dispatchMessage({
      type: "ROOM_READ_STATE_CONFIRMED",
      principalGeneration: 3,
      roomId: "room-1",
      readThroughSequence: 13,
    });
    worker.port.dispatchMessage({
      type: "ROOM_READ_STATE_CONFIRMED",
      principalGeneration: 2,
      roomId: "room-1",
      readThroughSequence: 14,
    });

    expect(confirmationListener).toHaveBeenCalledOnce();
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

  it("방 lifecycle claim이 provider attach보다 먼저 실행되어도 ATTACH 뒤에 전달한다", () => {
    const worker = createFakeWorker();
    const createId = vi.fn().mockReturnValueOnce("claim-1").mockReturnValueOnce("port-1");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker: () => worker,
    });

    transport.claimRoom("room-01");

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "claiming",
      roomId: "room-01",
      error: null,
    });
    expect(worker.port.postMessage).not.toHaveBeenCalled();

    transport.attach();

    expect(worker.port.postMessage).toHaveBeenNthCalledWith(1, {
      type: "ATTACH",
      portId: "port-1",
    });
    expect(worker.port.postMessage).toHaveBeenNthCalledWith(2, {
      type: "CLAIM_ROOM",
      portId: "port-1",
      requestId: "claim-1",
      roomId: "room-01",
    });
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
      messageVisibleAfterSequence: 100,
      watermarkSequence: 120,
    });
    expect(transport.getRoomSnapshot()).toEqual({
      status: "active",
      roomId: "room-01",
      generation: 1,
      replacedByRoomId: null,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 120,
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
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
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
      messageVisibleAfterSequence: 5,
      watermarkSequence: 10,
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
      messageVisibleAfterSequence: 10,
      watermarkSequence: 20,
    });
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "active",
      roomId: "room-02",
      generation: 2,
      messageVisibleAfterSequence: 10,
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
      messageVisibleAfterSequence: 10,
      watermarkSequence: 20,
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
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    });
  });

  it("attach 후 Worker port가 유실된 상태의 방 명령은 room session 오류를 노출한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "request-1",
      createWorker: () => worker,
    });

    transport.attach();
    worker.dispatchError();
    transport.claimRoom("room-01");

    expect(transport.getRoomSnapshot()).toEqual({
      status: "error",
      roomId: "room-01",
      generation: 0,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
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
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: {
        code: "SUBSCRIPTION_REJECTED",
        serverCode: "ACTIVE_ROOM_LIMIT_EXCEEDED",
        message: "서버가 방 구독을 거절했습니다.",
      },
    });
  });

  it("ROOM_CLOSED 종료를 재시도 불가능한 room session 오류로 보존한다", () => {
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
      code: "ROOM_CLOSED",
      message: "채팅방이 종료되어 실시간 연결이 해제되었습니다.",
    });

    expect(transport.getRoomSnapshot()).toEqual({
      status: "error",
      roomId: "room-01",
      generation: 4,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: {
        code: "ROOM_CLOSED",
        serverCode: "ROOM_CLOSED",
        message: "채팅방이 종료되어 실시간 연결이 해제되었습니다.",
      },
    });
  });

  it("구독 sync 진행과 거절을 room session 상태로 반영한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker: () => worker,
    });

    transport.attach();
    worker.port.dispatchMessage({
      type: "ROOM_SYNCING",
      roomId: "room-01",
      generation: 1,
    });

    expect(transport.getRoomSnapshot()).toEqual({
      status: "claiming",
      roomId: "room-01",
      generation: 1,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    });

    worker.port.dispatchMessage({
      type: "ROOM_SYNC_FAILED",
      requestId: "sync-1",
      roomId: "room-01",
      generation: 1,
      code: "ROOM_AUTHORIZATION_UNAVAILABLE",
      retryable: true,
      message: "일시적으로 권한을 확인하지 못했습니다.",
    });

    expect(transport.getRoomSnapshot()).toEqual({
      status: "error",
      roomId: "room-01",
      generation: 1,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: {
        code: "SUBSCRIPTION_SYNC_REJECTED",
        serverCode: "ROOM_AUTHORIZATION_UNAVAILABLE",
        retryable: true,
        message: "일시적으로 권한을 확인하지 못했습니다.",
      },
    });
  });

  it("REST 적용을 Worker에 알리고 delivery를 확인한 뒤 ack command를 보낸다", () => {
    const worker = createFakeWorker();
    const createId = vi.fn().mockReturnValueOnce("port-1").mockReturnValueOnce("claim-1");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker: () => worker,
    });
    const listener = vi.fn();

    transport.attach();
    transport.claimRoom("room-01");
    worker.port.dispatchMessage({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      watermarkSequence: 1,
    });
    transport.markRoomSnapshotApplied("room-01", 1);

    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "ROOM_SNAPSHOT_APPLIED",
      portId: "port-1",
      roomId: "room-01",
      generation: 1,
    });

    transport.observeRealtimeEventDelivery(listener);
    worker.port.dispatchMessage({
      type: "ROOM_EVENTS_DELIVERED",
      deliveryId: "delivery-1",
      roomId: "room-01",
      generation: 1,
      throughBufferSequence: 1,
      overflowed: false,
      invalidEventCount: 0,
      events: [
        {
          bufferSequence: 1,
          kind: "message",
          event: {
            eventVersion: 2,
            eventType: "CHAT_MESSAGE_CREATED",
            payload: {
              messageId: "message-01",
              roomId: "room-01",
              roomSequence: 1,
              countable: true,
              senderMembershipId: "membership-01",
              clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
              content: "안녕하세요.",
              createdAt: "2026-07-30T00:00:00Z",
              deletedAt: null,
              messageVersion: 1,
              state: "ACTIVE",
              updatedAt: "2026-07-30T00:00:00Z",
            },
          },
        },
      ],
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(transport.getRealtimeEventDelivery()).toMatchObject({
      deliveryId: "delivery-1",
      roomId: "room-01",
      generation: 1,
      throughBufferSequence: 1,
    });

    transport.acknowledgeRealtimeEventDelivery("delivery-1");

    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "ROOM_EVENTS_APPLIED",
      portId: "port-1",
      deliveryId: "delivery-1",
      roomId: "room-01",
      generation: 1,
    });
    expect(transport.getRealtimeEventDelivery()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("메시지 전송 명령과 Worker command 결과를 탭 transport로 중계한다", () => {
    const worker = createFakeWorker();
    const createId = vi.fn().mockReturnValueOnce("port-1").mockReturnValueOnce("claim-1");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker: () => worker,
    });
    const listener = vi.fn();
    const request = {
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      content: "안녕하세요.",
    };

    transport.attach();
    worker.port.dispatchMessage({
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: "worker-1",
      attachedPortCount: 1,
      principalGeneration: 0,
      snapshot: {
        status: "connected",
        error: null,
      },
    });
    transport.claimRoom("room-01");
    worker.port.dispatchMessage({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      watermarkSequence: 0,
    });
    transport.observeMessageCommandEvent(listener);
    transport.sendRoomMessage({ roomId: "room-01", request });

    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "SEND_ROOM_MESSAGE",
      portId: "port-1",
      roomId: "room-01",
      request,
    });

    worker.port.dispatchMessage({
      type: "ROOM_MESSAGE_COMMAND_RESULT",
      roomId: "room-01",
      result: {
        clientMessageId: request.clientMessageId,
        status: "ACCEPTED",
        code: null,
        retryable: false,
        retryAfterMs: null,
        messageId: "message-01",
        roomSequence: 1,
      },
    });

    expect(listener).toHaveBeenCalledWith({
      kind: "result",
      roomId: "room-01",
      result: expect.objectContaining({
        clientMessageId: request.clientMessageId,
        status: "ACCEPTED",
      }),
    });
  });

  it("Worker의 개인 inbox 이벤트를 탭 구독자에게 중계한다", () => {
    const worker = createFakeWorker();
    const transport = new SharedWorkerTransport({
      createId: () => "port-1",
      createWorker: () => worker,
    });
    const listener = vi.fn();

    transport.attach();
    transport.observeRoomInboxEvent(listener);
    worker.port.dispatchMessage({
      type: "ROOM_INBOX_EVENT",
      event: {
        eventVersion: 2,
        eventId: "550e8400-e29b-41d4-a716-446655440021",
        eventType: "ROOM_INBOX_INVALIDATED",
        cause: "MESSAGE_DELETED",
        roomId: "room-02",
        roomNameHint: null,
        emittedAt: "2026-08-04T01:10:00Z",
        sourceEventIds: ["chat-message-deleted:message-20:v2"],
        coalescedCreateCount: null,
        notificationHint: null,
      },
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ cause: "MESSAGE_DELETED", roomId: "room-02" }),
    );
  });

  it("메시지 수정·삭제 명령과 Worker mutation 결과를 탭 transport로 중계한다", () => {
    const worker = createFakeWorker();
    const createId = vi.fn().mockReturnValueOnce("port-1").mockReturnValueOnce("claim-1");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker: () => worker,
    });
    const listener = vi.fn();
    const lifecycleListener = vi.fn();
    const editRequest = {
      clientMutationId: "550e8400-e29b-41d4-a716-446655440010",
      messageId: "message-01",
      content: "수정된 메시지",
    };
    const deleteRequest = {
      clientMutationId: "550e8400-e29b-41d4-a716-446655440011",
      messageId: "message-01",
    };

    transport.attach();
    worker.port.dispatchMessage({
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: "worker-1",
      attachedPortCount: 1,
      principalGeneration: 0,
      snapshot: {
        status: "connected",
        error: null,
      },
    });
    transport.claimRoom("room-01");
    worker.port.dispatchMessage({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      watermarkSequence: 1,
    });
    transport.observeMessageMutationEvent(listener);
    transport.observeMessageMutationLifecycle(lifecycleListener);

    transport.editRoomMessage({ roomId: "room-01", request: editRequest });
    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "EDIT_ROOM_MESSAGE",
      portId: "port-1",
      roomId: "room-01",
      request: editRequest,
    });

    transport.deleteRoomMessage({ roomId: "room-01", request: deleteRequest });
    expect(worker.port.postMessage).toHaveBeenLastCalledWith({
      type: "DELETE_ROOM_MESSAGE",
      portId: "port-1",
      roomId: "room-01",
      request: deleteRequest,
    });

    worker.port.dispatchMessage({
      type: "ROOM_MESSAGE_MUTATION_RESULT",
      roomId: "room-01",
      result: {
        clientMessageId: null,
        status: "UPDATED",
        code: null,
        retryable: false,
        retryAfterMs: null,
        messageId: "message-01",
        roomSequence: 1,
        commandType: "EDIT_MESSAGE",
        clientMutationId: editRequest.clientMutationId,
        messageVersion: 2,
        messageState: "ACTIVE",
        replayed: false,
      },
    });
    worker.port.dispatchMessage({
      type: "ROOM_MESSAGE_MUTATION_FAILED",
      roomId: "room-01",
      clientMutationId: deleteRequest.clientMutationId,
      code: "MUTATION_PUBLISH_FAILED",
      retryable: true,
      message: "수정·삭제 요청을 전송하지 못했습니다.",
    });
    worker.port.dispatchMessage({
      type: "ROOM_MESSAGE_MUTATION_LIFECYCLE",
      event: {
        attempt: 2,
        clientMutationId: editRequest.clientMutationId,
        commandType: "EDIT_MESSAGE",
        generation: 1,
        messageId: "message-01",
        reason: null,
        retryAt: null,
        roomId: "room-01",
        status: "completed",
      },
    });

    expect(listener).toHaveBeenNthCalledWith(1, {
      kind: "result",
      roomId: "room-01",
      result: expect.objectContaining({
        clientMutationId: editRequest.clientMutationId,
        status: "UPDATED",
      }),
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      kind: "failure",
      roomId: "room-01",
      clientMutationId: deleteRequest.clientMutationId,
      code: "MUTATION_PUBLISH_FAILED",
      retryable: true,
      message: "수정·삭제 요청을 전송하지 못했습니다.",
    });
    expect(lifecycleListener).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMutationId: editRequest.clientMutationId,
        status: "completed",
      }),
    );
  });

  it("현재 방 generation의 delivery lifecycle만 탭으로 중계한다", () => {
    const worker = createFakeWorker();
    const createId = vi.fn().mockReturnValueOnce("port-1").mockReturnValueOnce("claim-1");
    const transport = new SharedWorkerTransport({
      createId,
      createWorker: () => worker,
    });
    const listener = vi.fn();

    transport.attach();
    worker.port.dispatchMessage({
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: "worker-1",
      attachedPortCount: 1,
      principalGeneration: 0,
      snapshot: {
        status: "connected",
        error: null,
      },
    });
    transport.claimRoom("room-01");
    worker.port.dispatchMessage({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 0,
      watermarkSequence: 0,
    });
    transport.observeMessageDeliveryLifecycle(listener);

    const lifecycle = {
      type: "ROOM_MESSAGE_DELIVERY_LIFECYCLE" as const,
      event: {
        attempt: 1,
        clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
        generation: 1,
        reason: null,
        retryAt: null,
        roomId: "room-01",
        status: "sending" as const,
      },
    };
    worker.port.dispatchMessage(lifecycle);
    worker.port.dispatchMessage({
      ...lifecycle,
      event: {
        ...lifecycle.event,
        generation: 0,
      },
    });
    worker.port.dispatchMessage({
      ...lifecycle,
      event: {
        ...lifecycle.event,
        roomId: "room-02",
      },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(lifecycle.event);
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
