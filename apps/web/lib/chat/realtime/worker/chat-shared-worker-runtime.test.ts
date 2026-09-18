import type { IFrame, IMessage, StompSubscription } from "@stomp/stompjs";
import { describe, expect, it, vi } from "vitest";
import type {
  ChatSharedWorkerCommand,
  ChatSharedWorkerEvent,
} from "../chat-shared-worker-protocol";
import { ChatRealtimeDiagnosticStore } from "../diagnostics/chat-realtime-diagnostic-store";
import {
  ChatSharedWorkerRuntime,
  type ChatSharedWorkerPort,
  type ChatSharedWorkerStompClient,
} from "./chat-shared-worker-runtime";

describe("ChatSharedWorkerRuntime", () => {
  it("연결과 자동 재연결 lifecycle을 구조화 진단 로그로 보관한다", () => {
    const client = createFakeStompClient();
    const diagnostics = new ChatRealtimeDiagnosticStore({
      runtimeInstanceId: "worker-1",
      enabled: true,
      now: () => new Date("2026-08-05T00:00:00.000Z"),
      monotonicNow: () => 1,
    });
    let attempt = 0;
    const runtime = new ChatSharedWorkerRuntime(
      client,
      "worker-1",
      undefined,
      undefined,
      "shared-worker",
      diagnostics,
      () => `attempt-${++attempt}`,
      () => 1,
    );
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    client.onWebSocketClose({
      code: 1006,
      reason: "NETWORK_DISCONNECTED",
      wasClean: false,
    } as CloseEvent);
    void client.beforeConnect(undefined as never);
    client.onConnect({} as IFrame);
    port.send({
      type: "GET_DIAGNOSTICS",
      portId: "port-a",
      requestId: "diagnostics-1",
    });

    const snapshot = port.eventsOfType("DIAGNOSTICS_SNAPSHOT").at(-1)?.snapshot;
    expect(snapshot?.events.map((event) => event.event)).toEqual([
      "runtime.started",
      "port.attached",
      "connection.requested",
      "stomp.connected",
      "websocket.closed",
      "connection.requested",
      "stomp.connected",
    ]);
    expect(
      snapshot?.events.filter((event) => event.event === "connection.requested"),
    ).toMatchObject([
      { connectionAttemptId: "attempt-1", trigger: "initial-attach" },
      { connectionAttemptId: "attempt-2", trigger: "transport-reconnect" },
    ]);
    expect(snapshot?.events.find((event) => event.event === "websocket.closed")).toMatchObject({
      closeCode: 1006,
      closeReason: "NETWORK_DISCONNECTED",
      reconnectDecision: "reconnecting",
    });
  });

  it("인증 terminal 상태와 후속 close 결정을 순서대로 기록한다", () => {
    const client = createFakeStompClient();
    const diagnostics = new ChatRealtimeDiagnosticStore({
      runtimeInstanceId: "worker-1",
      enabled: true,
    });
    const runtime = new ChatSharedWorkerRuntime(
      client,
      "worker-1",
      undefined,
      undefined,
      "shared-worker",
      diagnostics,
      () => "attempt-1",
    );
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onStompError({
      headers: {
        message: "AUTHENTICATION_REQUIRED",
        "content-type": "application/json",
      },
      body: JSON.stringify({ code: "AUTHENTICATION_REQUIRED", retryable: false }),
    } as unknown as IFrame);
    client.onWebSocketClose({ code: 1002, reason: "", wasClean: false } as CloseEvent);
    port.send({
      type: "GET_DIAGNOSTICS",
      portId: "port-a",
      requestId: "diagnostics-1",
    });

    const events = port.eventsOfType("DIAGNOSTICS_SNAPSHOT").at(-1)?.snapshot.events ?? [];
    expect(events.slice(-3).map((event) => event.event)).toEqual([
      "stomp.error",
      "authentication.required",
      "websocket.closed",
    ]);
    expect(events.at(-1)).toMatchObject({
      event: "websocket.closed",
      closeCode: 1002,
      reconnectDecision: "authentication-state-preserved",
    });
  });

  it("Room claim부터 subscription sync 완료까지의 lifecycle을 기록한다", () => {
    const client = createFakeStompClient();
    const diagnostics = new ChatRealtimeDiagnosticStore({
      runtimeInstanceId: "worker-1",
      enabled: true,
    });
    const runtime = new ChatSharedWorkerRuntime(
      client,
      "worker-1",
      () => "550e8400-e29b-41d4-a716-446655440001",
      undefined,
      "shared-worker",
      diagnostics,
      () => "attempt-1",
    );
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    port.send({
      type: "GET_DIAGNOSTICS",
      portId: "port-a",
      requestId: "diagnostics-1",
    });

    const roomEvents =
      port
        .eventsOfType("DIAGNOSTICS_SNAPSHOT")
        .at(-1)
        ?.snapshot.events.filter((event) => event.event.startsWith("room.")) ?? [];
    expect(roomEvents.map((event) => event.event)).toEqual([
      "room.claim.requested",
      "room.subscriptions.started",
      "room.sync.requested",
      "room.sync.ready",
      "room.activated",
    ]);
    expect(roomEvents.find((event) => event.event === "room.sync.ready")).toMatchObject({
      requestId: "550e8400-e29b-41d4-a716-446655440001",
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 120,
    });
  });

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

  it("개인 inbox 이벤트를 연결된 모든 port에 broadcast한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    client.onConnect({} as IFrame);
    client.deliver(
      "/user/queue/room-inbox-events",
      JSON.stringify({
        eventVersion: 2,
        eventId: "550e8400-e29b-41d4-a716-446655440022",
        eventType: "ROOM_INBOX_INVALIDATED",
        cause: "MESSAGE_CREATED",
        roomId: "room-02",
        roomNameHint: "다른 방",
        emittedAt: "2026-08-04T01:10:00Z",
        sourceEventIds: ["chat-message-created:message-22"],
        coalescedCreateCount: 1,
        notificationHint: {
          messageId: "message-22",
          messageVersion: 1,
          senderMembershipId: "membership-02",
          messageCreatedAt: "2026-08-04T01:09:59Z",
          preview: "새 메시지",
          previewTruncated: false,
        },
      }),
    );

    expect(portA.eventsOfType("ROOM_INBOX_EVENT")).toHaveLength(1);
    expect(portB.eventsOfType("ROOM_INBOX_EVENT")).toHaveLength(1);
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

  it("4001 CONNECTION_REPLACED를 모든 port에 알리고 재연결을 중단한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    client.onConnect({} as IFrame);
    client.onWebSocketClose({
      code: 4001,
      reason: "CONNECTION_REPLACED",
    } as CloseEvent);

    const replacedSnapshot = {
      status: "replaced",
      error: {
        source: "websocket",
        code: "CONNECTION_REPLACED",
        message: "다른 브라우저나 기기에서 채팅에 연결하여 현재 연결이 종료되었습니다.",
      },
    };

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(portA.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual(replacedSnapshot);
    expect(portB.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual(replacedSnapshot);

    portA.send({ type: "RECONNECT", portId: "port-a" });

    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(client.forceDisconnect).not.toHaveBeenCalled();
  });

  it("정상 연결에서는 로그인 성공 신호로 불필요한 재연결을 만들지 않는다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-1" });
    client.onConnect({} as IFrame);
    port.send({
      type: "RECONNECT",
      portId: "port-1",
      reason: "authentication-succeeded",
    });

    expect(port.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual({
      status: "connected",
      error: null,
    });
    expect(port.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.principalGeneration).toBe(1);
    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(client.forceDisconnect).not.toHaveBeenCalled();
  });

  it("현재 인증 세대의 read-state 성공을 송신 port를 제외한 다른 port에 전달한다", () => {
    const runtime = new ChatSharedWorkerRuntime(createFakeStompClient());
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    portA.send({
      type: "RECONNECT",
      portId: "port-a",
      reason: "authentication-succeeded",
    });
    portA.send({
      type: "CONFIRM_ROOM_READ_STATE",
      portId: "port-a",
      principalGeneration: 1,
      roomId: "room-1",
      readThroughSequence: 13,
    });

    expect(portA.eventsOfType("ROOM_READ_STATE_CONFIRMED")).toHaveLength(0);
    expect(portB.eventsOfType("ROOM_READ_STATE_CONFIRMED")).toEqual([
      {
        type: "ROOM_READ_STATE_CONFIRMED",
        principalGeneration: 1,
        roomId: "room-1",
        readThroughSequence: 13,
      },
    ]);

    portA.send({
      type: "CONFIRM_ROOM_READ_STATE",
      portId: "port-a",
      principalGeneration: 0,
      roomId: "room-1",
      readThroughSequence: 14,
    });
    expect(portB.eventsOfType("ROOM_READ_STATE_CONFIRMED")).toHaveLength(1);
  });

  it("AUTHENTICATION_REQUIRED를 모든 port에 알리고 후속 close와 재연결을 차단한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    client.onStompError({
      headers: {
        message: "AUTHENTICATION_REQUIRED",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code: "AUTHENTICATION_REQUIRED",
        retryable: false,
      }),
    } as unknown as IFrame);

    const authenticationRequiredSnapshot = {
      status: "authentication-required",
      error: {
        source: "stomp",
        code: "AUTHENTICATION_REQUIRED",
        message: "채팅 연결 인증이 유효하지 않습니다. 다시 로그인해 주세요.",
      },
    };

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(portA.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual(
      authenticationRequiredSnapshot,
    );
    expect(portB.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual(
      authenticationRequiredSnapshot,
    );

    client.onWebSocketError({} as Event);
    client.onWebSocketClose({ code: 1002, reason: "PROTOCOL_ERROR" } as CloseEvent);
    portA.send({ type: "RECONNECT", portId: "port-a" });

    expect(portA.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual(
      authenticationRequiredSnapshot,
    );
    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(client.forceDisconnect).not.toHaveBeenCalled();

    portA.send({
      type: "RECONNECT",
      portId: "port-a",
      reason: "authentication-succeeded",
    });

    expect(portA.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual({
      status: "connecting",
      error: null,
    });
    expect(client.activate).toHaveBeenCalledTimes(2);
  });

  it("4002 ROOM_ACCESS_REVOKED에서는 새 연결에서 방 구독과 sync를 다시 구성한다", async () => {
    const client = createFakeStompClient({ autoReady: false });
    const createId = vi
      .fn()
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002");
    const runtime = new ChatSharedWorkerRuntime(client, "worker-1", createId);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        roomId: "room-01",
        messageVisibleAfterSequence: 0,
        watermarkSequence: 20,
      }),
    );
    client.frames.length = 0;

    client.onWebSocketClose({
      code: 4002,
      reason: "ROOM_ACCESS_REVOKED",
    } as CloseEvent);

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(client.forceDisconnect).not.toHaveBeenCalled();
    expect(port.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual({
      status: "reconnecting",
      error: {
        source: "websocket",
        code: "ROOM_ACCESS_REVOKED",
        message: "채팅방 접근 권한을 확인하고 있습니다.",
      },
    });
    expect(runtime.getRealtimeBufferSnapshot()).toMatchObject({
      roomId: "room-01",
      generation: 2,
      events: [],
    });

    await Promise.resolve();
    expect(client.activate).toHaveBeenCalledTimes(2);

    client.onConnect({} as IFrame);

    expect(client.frames).toEqual([
      "SUBSCRIBE /user/queue/system-events",
      "SUBSCRIBE /user/queue/command-results",
      "SUBSCRIBE /user/queue/room-inbox-events",
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
      "SUBSCRIBE /topic/rooms/room-01/read-receipts",
      "SEND /app/rooms/room-01/subscriptions/sync",
    ]);
    expect(port.eventsOfType("ROOM_SYNCING").at(-1)).toMatchObject({
      roomId: "room-01",
      generation: 2,
    });

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440002",
        roomId: "room-01",
        messageVisibleAfterSequence: 100,
        watermarkSequence: 121,
      }),
    );

    expect(port.eventsOfType("ROOM_ACTIVATED").at(-1)).toMatchObject({
      requestId: "claim-1",
      roomId: "room-01",
      generation: 2,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 121,
    });
  });

  it("4003 ROOM_CLOSED에서는 방 lease를 폐기하고 공통 queue만 다시 연결한다", async () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.frames.length = 0;

    client.onWebSocketClose({
      code: 4003,
      reason: "ROOM_CLOSED",
    } as CloseEvent);

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(runtime.getRealtimeBufferSnapshot()).toBeNull();
    expect(port.eventsOfType("ROOM_SUBSCRIPTION_FAILED").at(-1)).toMatchObject({
      roomId: "room-01",
      generation: 2,
      code: "ROOM_CLOSED",
      message: "채팅방이 종료되어 연결이 해제되었습니다.",
    });

    await Promise.resolve();
    expect(client.activate).toHaveBeenCalledTimes(2);

    client.onConnect({} as IFrame);

    expect(client.frames).toEqual([
      "SUBSCRIBE /user/queue/system-events",
      "SUBSCRIBE /user/queue/command-results",
      "SUBSCRIBE /user/queue/room-inbox-events",
    ]);
    expect(port.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual({
      status: "connected",
      error: null,
    });
  });

  it("첫 방 claim을 활성 lease로 만들고 같은 owner의 중복 claim은 generation을 유지한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "request-1",
      roomId: "room-01",
    });

    expect(port.eventsOfType("ROOM_ACTIVATED")).toHaveLength(0);

    client.onConnect({} as IFrame);
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
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
      },
      {
        type: "ROOM_ACTIVATED",
        requestId: "request-2",
        roomId: "room-01",
        generation: 1,
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
      },
    ]);
    expect(client.frames).toEqual([
      "SUBSCRIBE /user/queue/system-events",
      "SUBSCRIBE /user/queue/command-results",
      "SUBSCRIBE /user/queue/room-inbox-events",
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
      "SUBSCRIBE /topic/rooms/room-01/read-receipts",
      "SEND /app/rooms/room-01/subscriptions/sync",
      "SEND /app/rooms/room-01/subscriptions/sync",
    ]);
  });

  it("일치하는 READY 전에는 lease를 활성화하지 않고 오래된 READY를 무시한다", () => {
    const client = createFakeStompClient({ autoReady: false });
    const runtime = new ChatSharedWorkerRuntime(
      client,
      "worker-1",
      () => "550e8400-e29b-41d4-a716-446655440001",
    );
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });

    expect(port.eventsOfType("ROOM_SYNCING").at(-1)).toEqual({
      type: "ROOM_SYNCING",
      roomId: "room-01",
      generation: 1,
    });
    expect(port.eventsOfType("ROOM_ACTIVATED")).toHaveLength(0);

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440099",
        roomId: "room-01",
        messageVisibleAfterSequence: 90,
        watermarkSequence: 99,
      }),
    );
    expect(port.eventsOfType("ROOM_ACTIVATED")).toHaveLength(0);

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        roomId: "room-01",
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
      }),
    );
    expect(port.eventsOfType("ROOM_ACTIVATED").at(-1)).toEqual({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 120,
    });
  });

  it("방 topic 구독 직후부터 READY 이후까지 core와 Read Receipt 이벤트를 도착 순서로 버퍼링한다", () => {
    const client = createFakeStompClient({ autoReady: false });
    const runtime = new ChatSharedWorkerRuntime(
      client,
      "worker-1",
      () => "550e8400-e29b-41d4-a716-446655440001",
    );
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });

    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(11)));
    client.deliver(
      "/topic/rooms/room-01/room-events",
      JSON.stringify(createRoomEvent("event-topic")),
    );
    client.deliver(
      "/topic/rooms/room-01/read-receipts",
      JSON.stringify(createReadReceiptEvent(11)),
    );
    client.deliver("/user/queue/system-events", JSON.stringify(createRoomEvent("event-user")));
    client.deliver("/topic/rooms/room-01/messages", "{invalid-json");
    client.deliver("/topic/rooms/room-01/read-receipts", "{invalid-json");
    client.deliver(
      "/topic/rooms/room-01/read-receipts",
      JSON.stringify(createReadReceiptEvent(12, "room-02")),
    );

    expect(runtime.getRealtimeBufferSnapshot()).toMatchObject({
      roomId: "room-01",
      generation: 1,
      overflowed: false,
      invalidEventCount: 1,
      invalidReadReceiptEventCount: 2,
      events: [
        {
          bufferSequence: 1,
          kind: "message",
          event: { payload: { roomSequence: 11 } },
        },
        {
          bufferSequence: 2,
          kind: "room",
          event: { eventId: "event-topic" },
        },
        {
          bufferSequence: 3,
          kind: "read-receipt",
          event: { payload: { updates: [{ storedLastReadSequence: 11 }] } },
        },
        {
          bufferSequence: 4,
          kind: "room",
          event: { eventId: "event-user" },
        },
      ],
    });

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        roomId: "room-01",
        messageVisibleAfterSequence: 10,
        watermarkSequence: 11,
      }),
    );

    expect(runtime.getRealtimeBufferSnapshot()?.events).toHaveLength(4);
  });

  it("REST 적용 뒤 한 delivery씩 보내고 확인 대기 중 이벤트는 다음 delivery로 보존한다", () => {
    const client = createFakeStompClient({ autoReady: false });
    const createId = vi
      .fn()
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440003")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440004");
    const runtime = new ChatSharedWorkerRuntime(client, "worker-1", createId);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(1)));
    port.send({
      type: "ROOM_SNAPSHOT_APPLIED",
      portId: "port-a",
      roomId: "room-01",
      generation: 1,
    });
    expect(port.eventsOfType("ROOM_EVENTS_DELIVERED")).toHaveLength(0);

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        roomId: "room-01",
        messageVisibleAfterSequence: 0,
        watermarkSequence: 1,
      }),
    );

    expect(port.eventsOfType("ROOM_EVENTS_DELIVERED")).toHaveLength(0);

    port.send({
      type: "ROOM_SNAPSHOT_APPLIED",
      portId: "port-a",
      roomId: "room-01",
      generation: 1,
    });
    expect(port.eventsOfType("ROOM_EVENTS_DELIVERED").at(-1)).toMatchObject({
      deliveryId: "550e8400-e29b-41d4-a716-446655440002",
      roomId: "room-01",
      generation: 1,
      throughBufferSequence: 1,
      events: [{ bufferSequence: 1, event: { payload: { roomSequence: 1 } } }],
    });

    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(2)));
    expect(port.eventsOfType("ROOM_EVENTS_DELIVERED")).toHaveLength(1);

    port.send({
      type: "ROOM_EVENTS_APPLIED",
      portId: "port-a",
      deliveryId: "stale-delivery",
      roomId: "room-01",
      generation: 1,
    });
    expect(port.eventsOfType("ROOM_EVENTS_DELIVERED")).toHaveLength(1);

    port.send({
      type: "ROOM_EVENTS_APPLIED",
      portId: "port-a",
      deliveryId: "550e8400-e29b-41d4-a716-446655440002",
      roomId: "room-01",
      generation: 1,
    });
    expect(port.eventsOfType("ROOM_EVENTS_DELIVERED").at(-1)).toMatchObject({
      deliveryId: "550e8400-e29b-41d4-a716-446655440003",
      throughBufferSequence: 2,
      events: [{ bufferSequence: 2, event: { payload: { roomSequence: 2 } } }],
    });
    expect(runtime.getRealtimeBufferSnapshot()?.events).toHaveLength(1);

    port.send({
      type: "ROOM_EVENTS_APPLIED",
      portId: "port-a",
      deliveryId: "550e8400-e29b-41d4-a716-446655440003",
      roomId: "room-01",
      generation: 1,
    });
    expect(runtime.getRealtimeBufferSnapshot()?.events).toEqual([]);

    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(3)));
    expect(port.eventsOfType("ROOM_EVENTS_DELIVERED").at(-1)).toMatchObject({
      deliveryId: "550e8400-e29b-41d4-a716-446655440004",
      events: [{ bufferSequence: 3, event: { payload: { roomSequence: 3 } } }],
    });
  });

  it("방 전환·재연결·release에서 현재 동기화 주기에 맞게 버퍼를 교체하거나 폐기한다", () => {
    const client = createFakeStompClient({ autoReady: false });
    const createId = vi
      .fn()
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440003");
    const runtime = new ChatSharedWorkerRuntime(client, "worker-1", createId);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(1)));

    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-2",
      roomId: "room-02",
    });
    expect(runtime.getRealtimeBufferSnapshot()).toMatchObject({
      roomId: "room-02",
      generation: 2,
      events: [],
    });

    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(2)));
    expect(runtime.getRealtimeBufferSnapshot()?.events).toEqual([]);

    client.deliver(
      "/topic/rooms/room-02/messages",
      JSON.stringify(createMessageEvent(1, "room-02")),
    );
    expect(runtime.getRealtimeBufferSnapshot()?.events).toHaveLength(1);

    client.onWebSocketClose({ reason: "network lost" } as CloseEvent);
    client.onConnect({} as IFrame);
    expect(runtime.getRealtimeBufferSnapshot()).toMatchObject({
      roomId: "room-02",
      generation: 2,
      events: [
        {
          bufferSequence: 1,
          kind: "message",
        },
      ],
    });

    port.send({
      type: "RELEASE_ROOM",
      portId: "port-a",
      requestId: "release-2",
      roomId: "room-02",
    });
    expect(runtime.getRealtimeBufferSnapshot()).toBeNull();
  });

  it("sync 거절은 lease를 유지하고 새 requestId를 사용한 수동 재활성화를 허용한다", () => {
    const client = createFakeStompClient({ autoReady: false });
    const createId = vi
      .fn()
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002");
    const runtime = new ChatSharedWorkerRuntime(client, "worker-1", createId);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "REJECTED",
        eventType: "ROOM_SUBSCRIPTION_SYNC_REJECTED",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        roomId: "room-01",
        code: "ROOM_AUTHORIZATION_UNAVAILABLE",
        retryable: true,
      }),
    );

    expect(port.eventsOfType("ROOM_SYNC_FAILED").at(-1)).toMatchObject({
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
      code: "ROOM_AUTHORIZATION_UNAVAILABLE",
      retryable: true,
    });

    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-2",
      roomId: "room-01",
    });
    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440002",
        roomId: "room-01",
        messageVisibleAfterSequence: 100,
        watermarkSequence: 121,
      }),
    );

    expect(port.eventsOfType("ROOM_ACTIVATED").at(-1)).toMatchObject({
      requestId: "claim-2",
      generation: 1,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 121,
    });
    expect(client.frames.filter((frame) => frame.includes("/subscriptions/sync"))).toHaveLength(2);
  });

  it("stale 방 topic을 재구독하고 새 requestId의 READY만 활성화한다", () => {
    const client = createFakeStompClient({ autoReady: false });
    const createId = vi
      .fn()
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002");
    const runtime = new ChatSharedWorkerRuntime(client, "worker-1", createId);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.frames.length = 0;
    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "REJECTED",
        eventType: "ROOM_SUBSCRIPTION_SYNC_REJECTED",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        roomId: "room-01",
        code: "ROOM_SUBSCRIPTION_STALE",
        retryable: false,
      }),
    );

    expect(client.frames).toEqual([
      "UNSUBSCRIBE /topic/rooms/room-01/messages",
      "UNSUBSCRIBE /topic/rooms/room-01/room-events",
      "UNSUBSCRIBE /topic/rooms/room-01/read-receipts",
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
      "SUBSCRIBE /topic/rooms/room-01/read-receipts",
      "SEND /app/rooms/room-01/subscriptions/sync",
    ]);
    expect(port.eventsOfType("ROOM_SYNC_FAILED")).toHaveLength(0);
    expect(port.eventsOfType("ROOM_SYNCING").at(-1)).toMatchObject({
      roomId: "room-01",
      generation: 2,
    });

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        roomId: "room-01",
        messageVisibleAfterSequence: 10,
        watermarkSequence: 11,
      }),
    );
    expect(port.eventsOfType("ROOM_ACTIVATED")).toHaveLength(0);

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "READY",
        eventType: "ROOM_SUBSCRIPTIONS_READY",
        requestId: "550e8400-e29b-41d4-a716-446655440002",
        roomId: "room-01",
        messageVisibleAfterSequence: 100,
        watermarkSequence: 121,
      }),
    );

    expect(port.eventsOfType("ROOM_ACTIVATED").at(-1)).toMatchObject({
      requestId: "claim-1",
      roomId: "room-01",
      generation: 2,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 121,
    });
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("stale 방 topic 재구독 실패는 lease와 버퍼를 폐기하고 owner에게 알린다", () => {
    const client = createFakeStompClient({ autoReady: false });
    const runtime = new ChatSharedWorkerRuntime(
      client,
      "worker-1",
      () => "550e8400-e29b-41d4-a716-446655440001",
    );
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    vi.mocked(client.subscribe).mockImplementationOnce(() => {
      throw new Error("room message subscribe failed");
    });

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "REJECTED",
        eventType: "ROOM_SUBSCRIPTION_SYNC_REJECTED",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        roomId: "room-01",
        code: "ROOM_SUBSCRIPTION_STALE",
        retryable: false,
      }),
    );

    expect(port.eventsOfType("ROOM_ACTIVATION_FAILED").at(-1)).toMatchObject({
      requestId: "claim-1",
      roomId: "room-01",
      code: "SUBSCRIPTION_SETUP_FAILED",
      message: "room message subscribe failed",
    });
    expect(port.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toMatchObject({
      status: "error",
      error: {
        source: "stomp",
        message: "room message subscribe failed",
      },
    });
    expect(runtime.getRealtimeBufferSnapshot()).toBeNull();
  });

  it("같은 방을 다른 port가 claim하면 구독 세대를 바꾸고 이전 owner를 교체한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    client.onConnect({} as IFrame);
    portA.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "request-a",
      roomId: "room-01",
    });
    client.frames.length = 0;
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
      messageVisibleAfterSequence: 100,
      watermarkSequence: 120,
    });
    expect(client.frames).toEqual(["SEND /app/rooms/room-01/subscriptions/sync"]);
  });

  it("다른 방 claim은 이전 owner를 교체하고 오래된 release가 새 lease를 해제하지 못한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    client.onConnect({} as IFrame);
    portA.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-a",
      roomId: "room-01",
    });
    client.frames.length = 0;
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
    expect(client.frames).toEqual([
      "UNSUBSCRIBE /topic/rooms/room-01/messages",
      "UNSUBSCRIBE /topic/rooms/room-01/room-events",
      "UNSUBSCRIBE /topic/rooms/room-01/read-receipts",
      "SUBSCRIBE /topic/rooms/room-02/messages",
      "SUBSCRIBE /topic/rooms/room-02/room-events",
      "SUBSCRIBE /topic/rooms/room-02/read-receipts",
      "SEND /app/rooms/room-02/subscriptions/sync",
      "SEND /app/rooms/room-02/subscriptions/sync",
    ]);
  });

  it("owner release와 detach는 lease를 해제하고 다음 claim에 새 generation을 부여한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const portA = createFakePort();
    const portB = createFakePort();

    runtime.connectPort(portA);
    runtime.connectPort(portB);
    portA.send({ type: "ATTACH", portId: "port-a" });
    portB.send({ type: "ATTACH", portId: "port-b" });
    client.onConnect({} as IFrame);
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
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
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

  it("재연결 시 공통 queue와 현재 활성 방 topic만 다시 구독한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.frames.length = 0;

    client.onWebSocketClose({ reason: "network lost" } as CloseEvent);
    client.onConnect({} as IFrame);

    expect(client.frames).toEqual([
      "SUBSCRIBE /user/queue/system-events",
      "SUBSCRIBE /user/queue/command-results",
      "SUBSCRIBE /user/queue/room-inbox-events",
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
      "SUBSCRIBE /topic/rooms/room-01/read-receipts",
      "SEND /app/rooms/room-01/subscriptions/sync",
    ]);
  });

  it("방 release는 방 topic만 순서대로 해제하고 공통 queue는 유지한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.frames.length = 0;

    port.send({
      type: "RELEASE_ROOM",
      portId: "port-a",
      requestId: "release-1",
      roomId: "room-01",
    });

    expect(client.frames).toEqual([
      "UNSUBSCRIBE /topic/rooms/room-01/messages",
      "UNSUBSCRIBE /topic/rooms/room-01/room-events",
      "UNSUBSCRIBE /topic/rooms/room-01/read-receipts",
    ]);
    expect(port.eventsOfType("ROOM_RELEASED").at(-1)?.generation).toBe(2);
  });

  it("서버의 방 구독 거절을 owner에게 전달하고 방 topic을 정리한다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const port = createFakePort();

    runtime.connectPort(port);
    port.send({ type: "ATTACH", portId: "port-a" });
    client.onConnect({} as IFrame);
    port.send({
      type: "CLAIM_ROOM",
      portId: "port-a",
      requestId: "claim-1",
      roomId: "room-01",
    });
    client.frames.length = 0;

    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "REJECTED",
        code: "ACTIVE_ROOM_LIMIT_EXCEEDED",
        destination: "/topic/rooms/room-01/messages",
      }),
    );

    expect(port.eventsOfType("ROOM_SUBSCRIPTION_FAILED").at(-1)).toMatchObject({
      roomId: "room-01",
      code: "ACTIVE_ROOM_LIMIT_EXCEEDED",
    });
    expect(client.frames).toEqual([
      "UNSUBSCRIBE /topic/rooms/room-01/messages",
      "UNSUBSCRIBE /topic/rooms/room-01/room-events",
      "UNSUBSCRIBE /topic/rooms/room-01/read-receipts",
    ]);
  });

  it("owner tab의 메시지만 publish하고 command 결과를 원래 탭으로 돌려준다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const ownerPort = createFakePort();
    const otherPort = createFakePort();
    const request = {
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      content: "안녕하세요.",
    };

    runtime.connectPort(ownerPort);
    runtime.connectPort(otherPort);
    ownerPort.send({ type: "ATTACH", portId: "port-owner" });
    otherPort.send({ type: "ATTACH", portId: "port-other" });
    client.onConnect({} as IFrame);
    ownerPort.send({
      type: "CLAIM_ROOM",
      portId: "port-owner",
      requestId: "claim-1",
      roomId: "room-01",
    });
    ownerPort.send({
      type: "ROOM_SNAPSHOT_APPLIED",
      portId: "port-owner",
      roomId: "room-01",
      generation: 1,
    });

    otherPort.send({
      type: "SEND_ROOM_MESSAGE",
      portId: "port-other",
      roomId: "room-01",
      request,
    });

    expect(otherPort.eventsOfType("ROOM_MESSAGE_SEND_FAILED").at(-1)).toMatchObject({
      roomId: "room-01",
      clientMessageId: request.clientMessageId,
      code: "ROOM_NOT_ACTIVE",
      retryable: true,
    });

    ownerPort.send({
      type: "SEND_ROOM_MESSAGE",
      portId: "port-owner",
      roomId: "room-01",
      request,
    });

    expect(client.publish).toHaveBeenLastCalledWith({
      destination: "/app/rooms/room-01/messages",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });

    client.deliver(
      "/user/queue/command-results",
      JSON.stringify({
        clientMessageId: request.clientMessageId,
        status: "ACCEPTED",
        code: null,
        retryable: false,
        retryAfterMs: null,
        messageId: "message-01",
        roomSequence: 1,
      }),
    );

    expect(ownerPort.eventsOfType("ROOM_MESSAGE_COMMAND_RESULT").at(-1)).toMatchObject({
      roomId: "room-01",
      result: {
        clientMessageId: request.clientMessageId,
        status: "ACCEPTED",
        messageId: "message-01",
        roomSequence: 1,
      },
    });
    expect(otherPort.eventsOfType("ROOM_MESSAGE_COMMAND_RESULT")).toEqual([]);
  });

  it("owner tab의 수정 command 결과만 clientMutationId로 원래 탭에 돌려준다", () => {
    const client = createFakeStompClient();
    const runtime = new ChatSharedWorkerRuntime(client);
    const ownerPort = createFakePort();
    const otherPort = createFakePort();
    const request = {
      clientMutationId: "550e8400-e29b-41d4-a716-446655440010",
      messageId: "message-01",
      content: "수정된 메시지",
    };

    runtime.connectPort(ownerPort);
    runtime.connectPort(otherPort);
    ownerPort.send({ type: "ATTACH", portId: "port-owner" });
    otherPort.send({ type: "ATTACH", portId: "port-other" });
    client.onConnect({} as IFrame);
    ownerPort.send({
      type: "CLAIM_ROOM",
      portId: "port-owner",
      requestId: "claim-1",
      roomId: "room-01",
    });
    ownerPort.send({
      type: "ROOM_SNAPSHOT_APPLIED",
      portId: "port-owner",
      roomId: "room-01",
      generation: 1,
    });

    otherPort.send({
      type: "EDIT_ROOM_MESSAGE",
      portId: "port-other",
      roomId: "room-01",
      request,
    });
    expect(otherPort.eventsOfType("ROOM_MESSAGE_MUTATION_FAILED").at(-1)).toMatchObject({
      clientMutationId: request.clientMutationId,
      code: "ROOM_NOT_ACTIVE",
      roomId: "room-01",
    });

    ownerPort.send({
      type: "EDIT_ROOM_MESSAGE",
      portId: "port-owner",
      roomId: "room-01",
      request,
    });
    expect(client.publish).toHaveBeenLastCalledWith({
      destination: "/app/rooms/room-01/messages/edit",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });

    client.deliver(
      "/user/queue/command-results",
      JSON.stringify({
        clientMessageId: null,
        status: "UPDATED",
        code: null,
        retryable: false,
        retryAfterMs: null,
        messageId: "message-01",
        roomSequence: 1,
        commandType: "EDIT_MESSAGE",
        clientMutationId: request.clientMutationId,
        messageVersion: 2,
        messageState: "ACTIVE",
        replayed: false,
      }),
    );

    expect(ownerPort.eventsOfType("ROOM_MESSAGE_MUTATION_RESULT").at(-1)).toMatchObject({
      roomId: "room-01",
      result: {
        clientMutationId: request.clientMutationId,
        commandType: "EDIT_MESSAGE",
        status: "UPDATED",
        messageVersion: 2,
      },
    });
    expect(otherPort.eventsOfType("ROOM_MESSAGE_MUTATION_RESULT")).toEqual([]);
  });

  it("수정 rate limit은 owner 탭에 노출하지 않고 동일 mutation을 재전송한다", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const client = createFakeStompClient();
      const runtime = new ChatSharedWorkerRuntime(client);
      const ownerPort = createFakePort();
      const request = {
        clientMutationId: "550e8400-e29b-41d4-a716-446655440012",
        messageId: "message-01",
        content: "재시도할 수정 메시지",
      };

      runtime.connectPort(ownerPort);
      ownerPort.send({ type: "ATTACH", portId: "port-owner" });
      client.onConnect({} as IFrame);
      ownerPort.send({
        type: "CLAIM_ROOM",
        portId: "port-owner",
        requestId: "claim-1",
        roomId: "room-01",
      });
      ownerPort.send({
        type: "ROOM_SNAPSHOT_APPLIED",
        portId: "port-owner",
        roomId: "room-01",
        generation: 1,
      });
      ownerPort.send({
        type: "EDIT_ROOM_MESSAGE",
        portId: "port-owner",
        roomId: "room-01",
        request,
      });

      client.deliver(
        "/user/queue/command-results",
        JSON.stringify({
          clientMessageId: null,
          clientMutationId: request.clientMutationId,
          replayed: false,
          commandType: "EDIT_MESSAGE",
          status: "REJECTED",
          code: "USER_RATE_LIMITED",
          retryable: true,
          retryAfterMs: 1_000,
          messageId: "message-01",
          roomSequence: null,
          messageVersion: null,
          messageState: null,
        }),
      );

      expect(ownerPort.eventsOfType("ROOM_MESSAGE_MUTATION_RESULT")).toEqual([]);
      expect(ownerPort.eventsOfType("ROOM_MESSAGE_MUTATION_LIFECYCLE").at(-1)?.event).toMatchObject(
        {
          clientMutationId: request.clientMutationId,
          retryAt: expect.any(Number),
          status: "retry-waiting",
        },
      );

      await vi.advanceTimersByTimeAsync(1_000);
      const editPublishes = vi
        .mocked(client.publish)
        .mock.calls.filter(([frame]) => frame.destination === "/app/rooms/room-01/messages/edit");
      expect(editPublishes).toHaveLength(2);
      expect(editPublishes[1]?.[0].body).toBe(editPublishes[0]?.[0].body);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it("USER_RATE_LIMITED는 owner 탭에 노출하지 않고 같은 메시지를 대기 후 재전송한다", () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const client = createFakeStompClient();
      const runtime = new ChatSharedWorkerRuntime(client);
      const ownerPort = createFakePort();
      const request = {
        clientMessageId: "550e8400-e29b-41d4-a716-446655440001",
        content: "자동 재전송 메시지",
      };
      prepareMessageOwner(runtime, client, ownerPort);

      ownerPort.send({
        type: "SEND_ROOM_MESSAGE",
        portId: "port-owner",
        roomId: "room-01",
        request,
      });
      client.deliver(
        "/user/queue/command-results",
        JSON.stringify({
          clientMessageId: request.clientMessageId,
          status: "REJECTED",
          code: "USER_RATE_LIMITED",
          retryable: true,
          retryAfterMs: 1_000,
          messageId: null,
          roomSequence: null,
        }),
      );

      expect(ownerPort.eventsOfType("ROOM_MESSAGE_COMMAND_RESULT")).toEqual([]);
      expect(
        ownerPort.eventsOfType("ROOM_MESSAGE_DELIVERY_LIFECYCLE").map(({ event }) => event.status),
      ).toEqual(["queued", "sending", "retry-waiting"]);
      expect(countRoomMessagePublishes(client, "room-01")).toBe(1);

      vi.advanceTimersByTime(999);
      expect(countRoomMessagePublishes(client, "room-01")).toBe(1);

      vi.advanceTimersByTime(1);
      expect(countRoomMessagePublishes(client, "room-01")).toBe(2);
      expect(client.publish).toHaveBeenLastCalledWith({
        destination: "/app/rooms/room-01/messages",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      });

      client.deliver(
        "/user/queue/command-results",
        JSON.stringify({
          clientMessageId: request.clientMessageId,
          status: "DUPLICATE",
          code: null,
          retryable: false,
          retryAfterMs: null,
          messageId: "message-01",
          roomSequence: 1,
        }),
      );

      expect(ownerPort.eventsOfType("ROOM_MESSAGE_COMMAND_RESULT")).toHaveLength(1);
      expect(ownerPort.eventsOfType("ROOM_MESSAGE_COMMAND_RESULT").at(-1)?.result.status).toBe(
        "DUPLICATE",
      );
      expect(
        ownerPort.eventsOfType("ROOM_MESSAGE_DELIVERY_LIFECYCLE").map(({ event }) => event.status),
      ).toEqual(["queued", "sending", "retry-waiting", "sending", "sent"]);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it("retry 대기 중 다른 탭이 방을 선점하면 기존 owner 메시지를 재전송하지 않는다", () => {
    vi.useFakeTimers();

    try {
      const client = createFakeStompClient();
      const runtime = new ChatSharedWorkerRuntime(client);
      const ownerPort = createFakePort();
      const nextOwnerPort = createFakePort();
      const request = {
        clientMessageId: "550e8400-e29b-41d4-a716-446655440002",
        content: "선점 전에 보낸 메시지",
      };
      prepareMessageOwner(runtime, client, ownerPort);
      runtime.connectPort(nextOwnerPort);
      nextOwnerPort.send({ type: "ATTACH", portId: "port-next-owner" });
      ownerPort.send({
        type: "SEND_ROOM_MESSAGE",
        portId: "port-owner",
        roomId: "room-01",
        request,
      });
      client.deliver(
        "/user/queue/command-results",
        JSON.stringify({
          clientMessageId: request.clientMessageId,
          status: "REJECTED",
          code: "SERVER_BUSY",
          retryable: true,
          retryAfterMs: 1_000,
          messageId: null,
          roomSequence: null,
        }),
      );

      nextOwnerPort.send({
        type: "CLAIM_ROOM",
        portId: "port-next-owner",
        requestId: "claim-2",
        roomId: "room-02",
      });
      vi.advanceTimersByTime(2_000);

      expect(countRoomMessagePublishes(client, "room-01")).toBe(1);
      expect(ownerPort.eventsOfType("ROOM_MESSAGE_COMMAND_RESULT")).toEqual([]);
      expect(ownerPort.eventsOfType("ROOM_MESSAGE_DELIVERY_LIFECYCLE").at(-1)?.event).toMatchObject(
        {
          clientMessageId: request.clientMessageId,
          reason: "ROOM_LEASE_REPLACED",
          status: "cancelled",
        },
      );
      expect(ownerPort.eventsOfType("ROOM_REPLACED").at(-1)).toMatchObject({
        roomId: "room-01",
        activatedRoomId: "room-02",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [4001, "CONNECTION_REPLACED"],
    [4002, "ROOM_ACCESS_REVOKED"],
    [4003, "ROOM_CLOSED"],
  ] as const)("WebSocket %i %s 종료는 대기 중인 메시지 retry timer를 취소한다", (code, reason) => {
    vi.useFakeTimers();

    try {
      const client = createFakeStompClient();
      const runtime = new ChatSharedWorkerRuntime(client);
      const ownerPort = createFakePort();
      const request = {
        clientMessageId: `550e8400-e29b-41d4-a716-44665544${code}`,
        content: "연결 종료 전에 보낸 메시지",
      };
      prepareMessageOwner(runtime, client, ownerPort);
      ownerPort.send({
        type: "SEND_ROOM_MESSAGE",
        portId: "port-owner",
        roomId: "room-01",
        request,
      });
      client.deliver(
        "/user/queue/command-results",
        JSON.stringify({
          clientMessageId: request.clientMessageId,
          status: "REJECTED",
          code: "SERVER_BUSY",
          retryable: true,
          retryAfterMs: 1_000,
          messageId: null,
          roomSequence: null,
        }),
      );

      client.onWebSocketClose({ code, reason } as CloseEvent);
      vi.advanceTimersByTime(2_000);

      expect(countRoomMessagePublishes(client, "room-01")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

type FakeStompClient = ChatSharedWorkerStompClient & {
  activate: ReturnType<typeof vi.fn<() => void>>;
  deactivate: ReturnType<typeof vi.fn<() => Promise<void>>>;
  deliver(destination: string, body: string): void;
  forceDisconnect: ReturnType<typeof vi.fn<() => void>>;
  frames: string[];
  setActive(value: boolean): void;
};

function createFakeStompClient({ autoReady = true } = {}): FakeStompClient {
  let active = false;
  let nextSubscriptionId = 1;
  const frames: string[] = [];
  const callbacks = new Map<string, Map<string, (message: IMessage) => void>>();

  const client: FakeStompClient = {
    get active() {
      return active;
    },
    activate: vi.fn(() => {
      active = true;
    }),
    beforeConnect: vi.fn(),
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
    publish: vi.fn(({ body, destination }) => {
      frames.push(`SEND ${destination}`);

      if (autoReady && destination.endsWith("/subscriptions/sync")) {
        const roomId = destination.split("/")[3];
        const { requestId } = JSON.parse(body) as { requestId: string };
        client.deliver(
          "/user/queue/system-events",
          JSON.stringify({
            status: "READY",
            eventType: "ROOM_SUBSCRIPTIONS_READY",
            requestId,
            roomId,
            messageVisibleAfterSequence: 100,
            watermarkSequence: 120,
          }),
        );
      }
    }),
    setActive(value) {
      active = value;
    },
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

function prepareMessageOwner(
  runtime: ChatSharedWorkerRuntime,
  client: FakeStompClient,
  ownerPort: FakePort,
): void {
  runtime.connectPort(ownerPort);
  ownerPort.send({ type: "ATTACH", portId: "port-owner" });
  client.onConnect({} as IFrame);
  ownerPort.send({
    type: "CLAIM_ROOM",
    portId: "port-owner",
    requestId: "claim-1",
    roomId: "room-01",
  });
  ownerPort.send({
    type: "ROOM_SNAPSHOT_APPLIED",
    portId: "port-owner",
    roomId: "room-01",
    generation: 1,
  });
}

function countRoomMessagePublishes(client: FakeStompClient, roomId: string): number {
  const frame = `SEND /app/rooms/${roomId}/messages`;
  return client.frames.filter((candidate) => candidate === frame).length;
}

function createMessageEvent(roomSequence: number, roomId = "room-01") {
  return {
    eventVersion: 2,
    eventType: "CHAT_MESSAGE_CREATED",
    payload: {
      messageId: `${roomId}-message-${roomSequence}`,
      roomId,
      roomSequence,
      countable: true,
      senderMembershipId: "membership-01",
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      content: `message ${roomSequence}`,
      createdAt: "2026-07-30T00:00:00Z",
      deletedAt: null,
      messageVersion: 1,
      state: "ACTIVE",
      updatedAt: "2026-07-30T00:00:00Z",
    },
  };
}

function createRoomEvent(eventId: string, roomId = "room-01") {
  return {
    eventVersion: 2,
    eventId,
    eventType: "ROOM_MEMBER_JOINED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId,
      roomVersion: 2,
      roomStatus: "ACTIVE",
      member: {
        membershipId: "membership-01",
        role: "MEMBER",
        status: "ACTIVE",
        membershipVersion: 1,
      },
    },
  };
}

function createReadReceiptEvent(storedLastReadSequence: number, roomId = "room-01") {
  return {
    eventVersion: 1,
    eventId: "550e8400-e29b-41d4-a716-446655440021",
    eventType: "ROOM_READ_POSITIONS_ADVANCED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId,
      updates: [
        {
          membershipId: "membership-02",
          membershipVersion: 1,
          storedLastReadSequence,
        },
      ],
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
