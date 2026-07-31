import type { IFrame, IMessage, StompSubscription } from "@stomp/stompjs";
import { describe, expect, it, vi } from "vitest";
import { DirectStompTransport, type DirectStompClient } from "./direct-stomp-transport";

describe("DirectStompTransport", () => {
  it("첫 consumer가 붙을 때만 연결하고 마지막 consumer가 떨어질 때 연결을 종료한다", async () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    const detachFirst = transport.attach();
    const detachSecond = transport.attach();

    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toEqual({
      status: "connecting",
      error: null,
    });

    detachFirst();
    expect(client.deactivate).not.toHaveBeenCalled();

    detachSecond();
    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot().status).toBe("disconnecting");

    await Promise.resolve();
    expect(transport.getSnapshot()).toEqual({
      status: "disconnected",
      error: null,
    });
  });

  it("detach 함수는 여러 번 호출해도 attachment를 한 번만 해제한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);
    const detach = transport.attach();

    detach();
    detach();

    expect(client.deactivate).toHaveBeenCalledTimes(1);
  });

  it("STOMP 및 WebSocket callback을 직렬화 가능한 연결 상태로 변환한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);
    const listener = vi.fn();

    transport.observe(listener);
    transport.attach();
    client.onConnect({} as IFrame);

    expect(transport.getSnapshot()).toEqual({
      status: "connected",
      error: null,
    });

    client.onStompError({
      headers: { message: "Access denied" },
      body: "",
    } as unknown as IFrame);

    expect(transport.getSnapshot()).toEqual({
      status: "error",
      error: {
        source: "stomp",
        message: "Access denied",
      },
    });

    client.onWebSocketClose({
      reason: "network lost",
    } as CloseEvent);

    expect(transport.getSnapshot()).toEqual({
      status: "reconnecting",
      error: {
        source: "websocket",
        message: "network lost",
      },
    });
    expect(listener).toHaveBeenCalled();
  });

  it("4001 CONNECTION_REPLACED에서는 자동 및 수동 재연결을 중단한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    client.onWebSocketClose({
      code: 4001,
      reason: "CONNECTION_REPLACED",
    } as CloseEvent);

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toEqual({
      status: "replaced",
      error: {
        source: "websocket",
        code: "CONNECTION_REPLACED",
        message: "다른 브라우저, 프로필 또는 기기에서 채팅에 연결하여 이 연결이 종료되었습니다.",
      },
    });

    transport.reconnect();

    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(client.forceDisconnect).not.toHaveBeenCalled();
  });

  it("4002 ROOM_ACCESS_REVOKED에서는 기존 연결을 폐기하고 방 구독을 새로 구성한다", async () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.frames.length = 0;

    client.onWebSocketClose({
      code: 4002,
      reason: "ROOM_ACCESS_REVOKED",
    } as CloseEvent);

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(client.forceDisconnect).not.toHaveBeenCalled();
    expect(transport.getSnapshot()).toEqual({
      status: "reconnecting",
      error: {
        source: "websocket",
        code: "ROOM_ACCESS_REVOKED",
        message: "채팅방 접근 상태가 변경되어 연결을 새로 만들고 방 상태를 다시 확인하고 있습니다.",
      },
    });
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "claiming",
      roomId: "room-01",
      generation: 2,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
    });

    transport.reconnect();
    expect(client.activate).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    expect(client.activate).toHaveBeenCalledTimes(2);

    client.onConnect({} as IFrame);

    expect(client.frames).toEqual([
      "SUBSCRIBE /user/queue/system-events",
      "SUBSCRIBE /user/queue/command-results",
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
      "SEND /app/rooms/room-01/subscriptions/sync",
    ]);
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "active",
      roomId: "room-01",
      generation: 2,
    });
  });

  it("4003 ROOM_CLOSED에서는 닫힌 방 lease를 폐기하고 공통 queue만 다시 연결한다", async () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.frames.length = 0;

    client.onWebSocketClose({
      code: 4003,
      reason: "ROOM_CLOSED",
    } as CloseEvent);

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(transport.getRealtimeBufferSnapshot()).toBeNull();
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "error",
      roomId: "room-01",
      generation: 2,
      error: {
        code: "ROOM_CLOSED",
        serverCode: "ROOM_CLOSED",
      },
    });

    await Promise.resolve();
    expect(client.activate).toHaveBeenCalledTimes(2);

    client.onConnect({} as IFrame);

    expect(client.frames).toEqual([
      "SUBSCRIBE /user/queue/system-events",
      "SUBSCRIBE /user/queue/command-results",
    ]);
    expect(transport.getSnapshot()).toEqual({
      status: "connected",
      error: null,
    });
    expect(transport.getRealtimeBufferSnapshot()).toBeNull();
  });

  it("활성 연결은 강제로 닫아 재연결하고 비활성 연결은 다시 activate한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    transport.reconnect();

    expect(client.forceDisconnect).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot().status).toBe("reconnecting");

    client.setActive(false);
    transport.reconnect();

    expect(client.activate).toHaveBeenCalledTimes(2);
    expect(transport.getSnapshot()).toEqual({
      status: "connecting",
      error: null,
    });
  });

  it("consumer가 없으면 reconnect 요청을 무시한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.reconnect();

    expect(client.activate).not.toHaveBeenCalled();
    expect(client.forceDisconnect).not.toHaveBeenCalled();
  });

  it("SharedWorker 미지원 환경에서도 동일한 방 세션 API를 제공한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);
    const listener = vi.fn();

    transport.observeRoom(listener);
    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");

    expect(transport.getRoomSnapshot()).toEqual({
      status: "active",
      roomId: "room-01",
      generation: 1,
      replacedByRoomId: null,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 120,
      error: null,
    });

    transport.releaseRoom("room-01");
    expect(transport.getRoomSnapshot()).toEqual({
      status: "idle",
      roomId: null,
      generation: 2,
      replacedByRoomId: null,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("Direct fallback은 일치하는 READY를 받기 전까지 방을 활성화하지 않는다", () => {
    const client = createFakeClient({ autoReady: false });
    const transport = new DirectStompTransport(
      client,
      () => "550e8400-e29b-41d4-a716-446655440001",
    );

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "claiming",
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
    });

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
    expect(transport.getRoomSnapshot().status).toBe("claiming");

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
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "active",
      messageVisibleAfterSequence: 100,
      watermarkSequence: 120,
    });
  });

  it("Direct fallback도 READY 전 실시간 이벤트와 user queue Room Event를 버퍼링한다", () => {
    const client = createFakeClient({ autoReady: false });
    const transport = new DirectStompTransport(
      client,
      () => "550e8400-e29b-41d4-a716-446655440001",
    );

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(11)));
    client.deliver("/user/queue/system-events", JSON.stringify(createRoomEvent("event-user")));

    expect(transport.getRealtimeBufferSnapshot()).toMatchObject({
      roomId: "room-01",
      generation: 1,
      events: [
        {
          bufferSequence: 1,
          kind: "message",
        },
        {
          bufferSequence: 2,
          kind: "room",
        },
      ],
    });

    transport.releaseRoom("room-01");
    expect(transport.getRealtimeBufferSnapshot()).toBeNull();
  });

  it("Direct fallback은 sync 거절을 보존하고 같은 generation에서 새 sync를 시작한다", () => {
    const client = createFakeClient({ autoReady: false });
    const createId = vi
      .fn()
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002");
    const transport = new DirectStompTransport(client, createId);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
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

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "error",
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: {
        code: "SUBSCRIPTION_SYNC_REJECTED",
        serverCode: "ROOM_AUTHORIZATION_UNAVAILABLE",
        retryable: true,
      },
    });

    transport.claimRoom("room-01");

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "claiming",
      roomId: "room-01",
      generation: 1,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    });
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("Direct fallback은 stale 방 topic을 재구독하고 새 requestId로 sync한다", () => {
    const client = createFakeClient({ autoReady: false });
    const createId = vi
      .fn()
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002");
    const transport = new DirectStompTransport(client, createId);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(20)));
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
      "SUBSCRIBE /topic/rooms/room-01/messages",
      "SUBSCRIBE /topic/rooms/room-01/room-events",
      "SEND /app/rooms/room-01/subscriptions/sync",
    ]);
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "claiming",
      roomId: "room-01",
      generation: 2,
      messageVisibleAfterSequence: null,
      watermarkSequence: null,
      error: null,
    });
    expect(transport.getRealtimeBufferSnapshot()).toMatchObject({
      roomId: "room-01",
      generation: 2,
      events: [],
    });

    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(101)));
    expect(transport.getRealtimeBufferSnapshot()).toMatchObject({
      generation: 2,
      events: [
        {
          bufferSequence: 1,
          kind: "message",
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
    expect(transport.getRoomSnapshot().status).toBe("claiming");

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

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "active",
      generation: 2,
      messageVisibleAfterSequence: 100,
      watermarkSequence: 121,
    });
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("Direct fallback도 다른 방 전환 시 동일한 4-frame 순서를 사용한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.frames.length = 0;

    transport.claimRoom("room-02");

    expect(client.frames).toEqual([
      "UNSUBSCRIBE /topic/rooms/room-01/messages",
      "UNSUBSCRIBE /topic/rooms/room-01/room-events",
      "SUBSCRIBE /topic/rooms/room-02/messages",
      "SUBSCRIBE /topic/rooms/room-02/room-events",
      "SEND /app/rooms/room-02/subscriptions/sync",
    ]);
    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "active",
      roomId: "room-02",
    });
  });

  it("Direct fallback도 서버 구독 거절을 room session 오류로 변환한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.deliver(
      "/user/queue/system-events",
      JSON.stringify({
        status: "REJECTED",
        code: "ACTIVE_ROOM_LIMIT_EXCEEDED",
        destination: "/topic/rooms/room-01/messages",
      }),
    );

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "error",
      roomId: "room-01",
      error: {
        code: "SUBSCRIPTION_REJECTED",
        serverCode: "ACTIVE_ROOM_LIMIT_EXCEEDED",
      },
    });
  });

  it("Direct fallback도 REST 적용 뒤 delivery를 순차 전달하고 ack 범위만 제거한다", () => {
    const client = createFakeClient({ autoReady: false });
    const createId = vi
      .fn()
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440001")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440002")
      .mockReturnValueOnce("550e8400-e29b-41d4-a716-446655440003");
    const transport = new DirectStompTransport(client, createId);
    const listener = vi.fn();

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(1)));
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

    transport.observeRealtimeEventDelivery(listener);
    transport.markRoomSnapshotApplied("room-01", 1);

    expect(transport.getRealtimeEventDelivery()).toMatchObject({
      deliveryId: "550e8400-e29b-41d4-a716-446655440002",
      throughBufferSequence: 1,
      events: [{ bufferSequence: 1, event: { payload: { roomSequence: 1 } } }],
    });

    client.deliver("/topic/rooms/room-01/messages", JSON.stringify(createMessageEvent(2)));
    expect(listener).toHaveBeenCalledTimes(1);

    transport.acknowledgeRealtimeEventDelivery("550e8400-e29b-41d4-a716-446655440002");

    expect(transport.getRealtimeEventDelivery()).toMatchObject({
      deliveryId: "550e8400-e29b-41d4-a716-446655440003",
      throughBufferSequence: 2,
      events: [{ bufferSequence: 2, event: { payload: { roomSequence: 2 } } }],
    });
    expect(transport.getRealtimeBufferSnapshot()?.events).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("Direct fallback에서 메시지를 publish하고 command 결과를 전송 호출자에게 전달한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);
    const listener = vi.fn();
    const request = {
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      content: "안녕하세요.",
    };

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");
    transport.markRoomSnapshotApplied("room-01", 1);
    transport.observeMessageCommandEvent(listener);
    transport.sendRoomMessage({ roomId: "room-01", request });

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

    expect(listener).toHaveBeenCalledWith({
      kind: "result",
      roomId: "room-01",
      result: expect.objectContaining({
        clientMessageId: request.clientMessageId,
        status: "ACCEPTED",
      }),
    });
  });

  it("Direct fallback도 USER_RATE_LIMITED를 숨기고 같은 메시지를 대기 후 재전송한다", () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const client = createFakeClient();
      const transport = new DirectStompTransport(client);
      const listener = vi.fn();
      const lifecycleListener = vi.fn();
      const request = {
        clientMessageId: "550e8400-e29b-41d4-a716-446655440010",
        content: "Direct 자동 재전송 메시지",
      };

      prepareMessageTransport(transport, client);
      transport.observeMessageCommandEvent(listener);
      transport.observeMessageDeliveryLifecycle(lifecycleListener);
      transport.sendRoomMessage({ roomId: "room-01", request });
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

      expect(listener).not.toHaveBeenCalled();
      expect(lifecycleListener.mock.calls.map(([event]) => event.status)).toEqual([
        "sending",
        "retry-waiting",
      ]);
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

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenLastCalledWith({
        kind: "result",
        roomId: "room-01",
        result: expect.objectContaining({
          clientMessageId: request.clientMessageId,
          status: "DUPLICATE",
        }),
      });
      expect(lifecycleListener.mock.calls.map(([event]) => event.status)).toEqual([
        "sending",
        "retry-waiting",
        "sending",
        "sent",
      ]);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it("Direct fallback의 방 전환은 이전 방에서 대기 중인 retry를 취소한다", () => {
    vi.useFakeTimers();

    try {
      const client = createFakeClient();
      const transport = new DirectStompTransport(client);
      const request = {
        clientMessageId: "550e8400-e29b-41d4-a716-446655440011",
        content: "방 전환 전에 보낸 메시지",
      };

      prepareMessageTransport(transport, client);
      transport.sendRoomMessage({ roomId: "room-01", request });
      rejectMessageForRetry(client, request.clientMessageId);

      transport.claimRoom("room-02");
      vi.advanceTimersByTime(60_000);

      expect(countRoomMessagePublishes(client, "room-01")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["release", "detach"] as const)(
    "Direct fallback의 %s는 대기 중인 retry를 취소한다",
    (lifecycle) => {
      vi.useFakeTimers();

      try {
        const client = createFakeClient();
        const transport = new DirectStompTransport(client);
        const request = {
          clientMessageId:
            lifecycle === "release"
              ? "550e8400-e29b-41d4-a716-446655440012"
              : "550e8400-e29b-41d4-a716-446655440013",
          content: "생명주기 종료 전에 보낸 메시지",
        };
        const detach = prepareMessageTransport(transport, client);

        transport.sendRoomMessage({ roomId: "room-01", request });
        rejectMessageForRetry(client, request.clientMessageId);

        if (lifecycle === "release") {
          transport.releaseRoom("room-01");
        } else {
          detach();
        }
        vi.advanceTimersByTime(60_000);

        expect(countRoomMessagePublishes(client, "room-01")).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([
    [4001, "CONNECTION_REPLACED"],
    [4002, "ROOM_ACCESS_REVOKED"],
    [4003, "ROOM_CLOSED"],
  ] as const)("Direct fallback의 WebSocket %i %s 종료는 retry를 취소한다", (code, reason) => {
    vi.useFakeTimers();

    try {
      const client = createFakeClient();
      const transport = new DirectStompTransport(client);
      const request = {
        clientMessageId: `550e8400-e29b-41d4-a716-44665544${code}`,
        content: "연결 종료 전에 보낸 메시지",
      };

      prepareMessageTransport(transport, client);
      transport.sendRoomMessage({ roomId: "room-01", request });
      rejectMessageForRetry(client, request.clientMessageId);

      client.onWebSocketClose({ code, reason } as CloseEvent);
      vi.advanceTimersByTime(60_000);

      expect(countRoomMessagePublishes(client, "room-01")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("REST snapshot 적용 전에는 Direct fallback 메시지 전송을 거절한다", () => {
    const client = createFakeClient();
    const transport = new DirectStompTransport(client);

    transport.attach();
    client.onConnect({} as IFrame);
    transport.claimRoom("room-01");

    expect(() =>
      transport.sendRoomMessage({
        roomId: "room-01",
        request: {
          clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
          content: "아직 보내면 안 됩니다.",
        },
      }),
    ).toThrow("현재 탭의 채팅방 동기화가 완료되지 않아");
  });

  it("유효하지 않은 roomId는 Direct fallback에서도 로컬 오류로 거절한다", () => {
    const transport = new DirectStompTransport(createFakeClient());

    transport.claimRoom("invalid room");

    expect(transport.getRoomSnapshot()).toMatchObject({
      status: "error",
      roomId: "invalid room",
      error: {
        code: "INVALID_ROOM_ID",
      },
    });
  });
});

type FakeDirectStompClient = DirectStompClient & {
  deliver(destination: string, body: string): void;
  frames: string[];
  setActive(active: boolean): void;
};

function createFakeClient({ autoReady = true } = {}): FakeDirectStompClient {
  let active = false;
  let nextSubscriptionId = 1;
  const frames: string[] = [];
  const callbacks = new Map<string, Map<string, (message: IMessage) => void>>();

  const client: FakeDirectStompClient = {
    get active() {
      return active;
    },
    setActive(value) {
      active = value;
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
            messageVisibleAfterSequence: 100,
            watermarkSequence: 120,
          }),
        );
      }
    }),
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

function prepareMessageTransport(
  transport: DirectStompTransport,
  client: FakeDirectStompClient,
): () => void {
  const detach = transport.attach();
  client.onConnect({} as IFrame);
  transport.claimRoom("room-01");
  transport.markRoomSnapshotApplied("room-01", 1);
  return detach;
}

function rejectMessageForRetry(client: FakeDirectStompClient, clientMessageId: string): void {
  client.deliver(
    "/user/queue/command-results",
    JSON.stringify({
      clientMessageId,
      status: "REJECTED",
      code: "SERVER_BUSY",
      retryable: true,
      retryAfterMs: 1_000,
      messageId: null,
      roomSequence: null,
    }),
  );
}

function countRoomMessagePublishes(client: FakeDirectStompClient, roomId: string): number {
  return client.frames.filter((frame) => frame === `SEND /app/rooms/${roomId}/messages`).length;
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
