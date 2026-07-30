import type { IFrame, IMessage, StompSubscription } from "@stomp/stompjs";
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
        message: "다른 브라우저, 프로필 또는 기기에서 채팅에 연결하여 이 연결이 종료되었습니다.",
      },
    };

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(portA.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual(replacedSnapshot);
    expect(portB.eventsOfType("CONNECTION_SNAPSHOT").at(-1)?.snapshot).toEqual(replacedSnapshot);

    portA.send({ type: "RECONNECT", portId: "port-a" });

    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(client.forceDisconnect).not.toHaveBeenCalled();
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
        watermarkSequence: 120,
      },
      {
        type: "ROOM_ACTIVATED",
        requestId: "request-2",
        roomId: "room-01",
        generation: 1,
        watermarkSequence: 120,
      },
    ]);
    expect(client.frames).toEqual([
      "SUBSCRIBE /user/queue/system-events",
      "SUBSCRIBE /user/queue/command-results",
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
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
        watermarkSequence: 120,
      }),
    );
    expect(port.eventsOfType("ROOM_ACTIVATED").at(-1)).toEqual({
      type: "ROOM_ACTIVATED",
      requestId: "claim-1",
      roomId: "room-01",
      generation: 1,
      watermarkSequence: 120,
    });
  });

  it("방 topic 구독 직후부터 READY 이후까지 메시지와 Room Event를 도착 순서로 버퍼링한다", () => {
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
    client.deliver("/user/queue/system-events", JSON.stringify(createRoomEvent("event-user")));
    client.deliver("/topic/rooms/room-01/messages", "{invalid-json");

    expect(runtime.getRealtimeBufferSnapshot()).toMatchObject({
      roomId: "room-01",
      generation: 1,
      overflowed: false,
      invalidEventCount: 1,
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
        watermarkSequence: 11,
      }),
    );

    expect(runtime.getRealtimeBufferSnapshot()?.events).toHaveLength(3);
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
        watermarkSequence: 121,
      }),
    );

    expect(port.eventsOfType("ROOM_ACTIVATED").at(-1)).toMatchObject({
      requestId: "claim-2",
      generation: 1,
      watermarkSequence: 121,
    });
    expect(client.frames.filter((frame) => frame.includes("/subscriptions/sync"))).toHaveLength(2);
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
      "SUBSCRIBE /topic/rooms/room-02/messages",
      "SUBSCRIBE /topic/rooms/room-02/room-events",
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
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
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

function createMessageEvent(roomSequence: number, roomId = "room-01") {
  return {
    eventVersion: 1,
    eventType: "CHAT_MESSAGE_CREATED",
    payload: {
      messageId: `${roomId}-message-${roomSequence}`,
      roomId,
      roomSequence,
      senderUserId: "local-user-1",
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      content: `message ${roomSequence}`,
      createdAt: "2026-07-30T00:00:00Z",
    },
  };
}

function createRoomEvent(eventId: string, roomId = "room-01") {
  return {
    eventVersion: 1,
    eventId,
    eventType: "ROOM_MEMBER_JOINED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId,
      roomVersion: 2,
      roomStatus: "ACTIVE",
      member: {
        membershipId: "membership-01",
        userId: "local-user-1",
        role: "MEMBER",
        status: "ACTIVE",
        membershipVersion: 1,
      },
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
