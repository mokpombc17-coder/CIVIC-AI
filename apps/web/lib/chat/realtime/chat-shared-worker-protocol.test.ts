import { describe, expect, it } from "vitest";
import { isChatSharedWorkerCommand, isChatSharedWorkerEvent } from "./chat-shared-worker-protocol";

describe("chat shared worker protocol", () => {
  it("개인 inbox event payload를 검증한다", () => {
    const event = {
      type: "ROOM_INBOX_EVENT",
      event: {
        eventVersion: 1,
        eventId: "550e8400-e29b-41d4-a716-446655440023",
        eventType: "ROOM_INBOX_INVALIDATED",
        cause: "MESSAGE_DELETED",
        roomId: "room-02",
        roomNameHint: null,
        emittedAt: "2026-08-04T01:10:00Z",
        sourceEventIds: ["chat-message-deleted:message-23:v2"],
        coalescedCreateCount: null,
        notificationHint: null,
      },
    };

    expect(isChatSharedWorkerEvent(event)).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        ...event,
        event: { ...event.event, sourceEventIds: [] },
      }),
    ).toBe(false);
  });

  it("서버 close snapshot의 상태와 오류 code를 검증한다", () => {
    const snapshotEvent = {
      type: "CONNECTION_SNAPSHOT",
      workerInstanceId: "worker-1",
      attachedPortCount: 2,
      snapshot: {
        status: "replaced",
        error: {
          source: "websocket",
          code: "CONNECTION_REPLACED",
          message: "다른 환경에서 연결됨",
        },
      },
    };

    expect(isChatSharedWorkerEvent(snapshotEvent)).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        ...snapshotEvent,
        snapshot: {
          status: "reconnecting",
          error: {
            source: "websocket",
            code: "ROOM_ACCESS_REVOKED",
            message: "방 접근 회수",
          },
        },
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        ...snapshotEvent,
        snapshot: {
          status: "reconnecting",
          error: {
            source: "websocket",
            code: "ROOM_CLOSED",
            message: "방 종료",
          },
        },
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        ...snapshotEvent,
        snapshot: {
          ...snapshotEvent.snapshot,
          error: {
            ...snapshotEvent.snapshot.error,
            code: "UNKNOWN_CLOSE_CODE",
          },
        },
      }),
    ).toBe(false);
  });

  it("방 lease command의 correlation 필드를 검증한다", () => {
    expect(
      isChatSharedWorkerCommand({
        type: "CLAIM_ROOM",
        portId: "port-1",
        requestId: "request-1",
        roomId: "room-01",
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerCommand({
        type: "RELEASE_ROOM",
        portId: "port-1",
        requestId: "",
        roomId: "room-01",
      }),
    ).toBe(false);
  });

  it("방 lease event의 generation과 오류 payload를 검증한다", () => {
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_REPLACED",
        roomId: "room-01",
        activatedRoomId: "room-02",
        generation: 2,
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_ACTIVATED",
        requestId: "request-1",
        roomId: "room-01",
        generation: -1,
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_ACTIVATED",
        requestId: "request-1",
        roomId: "room-01",
        generation: 1,
        messageVisibleAfterSequence: 100,
        watermarkSequence: 120,
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_ACTIVATED",
        requestId: "request-1",
        roomId: "room-01",
        generation: 1,
        messageVisibleAfterSequence: -1,
        watermarkSequence: 120,
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_SYNCING",
        roomId: "room-01",
        generation: 1,
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_SYNC_FAILED",
        requestId: "request-1",
        roomId: "room-01",
        generation: 1,
        code: "ROOM_AUTHORIZATION_UNAVAILABLE",
        retryable: true,
        message: "retry",
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_ACTIVATION_FAILED",
        requestId: "request-1",
        roomId: "invalid room",
        code: "INVALID_ROOM_ID",
        message: "invalid",
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_SUBSCRIPTION_FAILED",
        roomId: "room-01",
        generation: 3,
        code: "ACTIVE_ROOM_LIMIT_EXCEEDED",
        message: "rejected",
      }),
    ).toBe(true);
  });

  it("REST 적용과 실시간 delivery 확인 command를 검증한다", () => {
    expect(
      isChatSharedWorkerCommand({
        type: "ROOM_SNAPSHOT_APPLIED",
        portId: "port-1",
        roomId: "room-01",
        generation: 1,
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerCommand({
        type: "ROOM_EVENTS_APPLIED",
        portId: "port-1",
        deliveryId: "delivery-1",
        roomId: "room-01",
        generation: 1,
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerCommand({
        type: "ROOM_EVENTS_APPLIED",
        portId: "port-1",
        deliveryId: "",
        roomId: "room-01",
        generation: 1,
      }),
    ).toBe(false);
  });

  it("메시지 전송 command와 command-result event를 검증한다", () => {
    const clientMessageId = "550e8400-e29b-41d4-a716-446655440000";

    expect(
      isChatSharedWorkerCommand({
        type: "SEND_ROOM_MESSAGE",
        portId: "port-1",
        roomId: "room-01",
        request: {
          clientMessageId,
          content: "안녕하세요.",
        },
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerCommand({
        type: "SEND_ROOM_MESSAGE",
        portId: "port-1",
        roomId: "room-01",
        request: {
          clientMessageId: "invalid",
          content: "안녕하세요.",
        },
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_MESSAGE_COMMAND_RESULT",
        roomId: "room-01",
        result: {
          clientMessageId,
          status: "ACCEPTED",
          code: null,
          retryable: false,
          retryAfterMs: null,
          messageId: "message-01",
          roomSequence: 1,
        },
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_MESSAGE_SEND_FAILED",
        roomId: "room-01",
        clientMessageId,
        code: "ROOM_NOT_ACTIVE",
        retryable: true,
        message: "방이 활성화되지 않았습니다.",
      }),
    ).toBe(true);
  });

  it("메시지 수정·삭제 command와 mutation 결과 event를 검증한다", () => {
    const clientMutationId = "550e8400-e29b-41d4-a716-446655440010";

    expect(
      isChatSharedWorkerCommand({
        type: "EDIT_ROOM_MESSAGE",
        portId: "port-1",
        roomId: "room-01",
        request: {
          clientMutationId,
          messageId: "message-01",
          content: "수정된 메시지",
        },
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerCommand({
        type: "DELETE_ROOM_MESSAGE",
        portId: "port-1",
        roomId: "room-01",
        request: {
          clientMutationId,
          messageId: "",
        },
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_MESSAGE_MUTATION_RESULT",
        roomId: "room-01",
        result: {
          clientMessageId: null,
          status: "UPDATED",
          code: null,
          retryable: false,
          retryAfterMs: null,
          messageId: "message-01",
          roomSequence: 10,
          commandType: "EDIT_MESSAGE",
          clientMutationId,
          messageVersion: 2,
          messageState: "ACTIVE",
          replayed: false,
        },
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_MESSAGE_MUTATION_FAILED",
        roomId: "room-01",
        clientMutationId,
        code: "ROOM_NOT_ACTIVE",
        retryable: true,
        message: "방이 활성화되지 않았습니다.",
      }),
    ).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        type: "ROOM_MESSAGE_MUTATION_LIFECYCLE",
        event: {
          attempt: 1,
          clientMutationId,
          commandType: "EDIT_MESSAGE",
          generation: 1,
          messageId: "message-01",
          reason: null,
          retryAt: 1_500,
          roomId: "room-01",
          status: "retry-waiting",
        },
      }),
    ).toBe(true);
  });

  it("메시지 delivery lifecycle event의 상태별 필드를 검증한다", () => {
    const lifecycle = {
      type: "ROOM_MESSAGE_DELIVERY_LIFECYCLE",
      event: {
        attempt: 1,
        clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
        generation: 1,
        reason: null,
        retryAt: 1_000,
        roomId: "room-01",
        status: "retry-waiting",
      },
    };

    expect(isChatSharedWorkerEvent(lifecycle)).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        ...lifecycle,
        event: {
          ...lifecycle.event,
          retryAt: null,
        },
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        ...lifecycle,
        event: {
          ...lifecycle.event,
          reason: null,
          retryAt: null,
          status: "failed",
        },
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        ...lifecycle,
        event: {
          ...lifecycle.event,
          reason: "MAX_ATTEMPTS_REACHED",
          retryAt: null,
          status: "failed",
        },
      }),
    ).toBe(true);
  });

  it("실시간 event delivery의 순서와 payload room을 검증한다", () => {
    const delivery = {
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
            eventVersion: 1,
            eventType: "CHAT_MESSAGE_CREATED",
            payload: {
              messageId: "message-01",
              roomId: "room-01",
              roomSequence: 1,
              countable: true,
              senderUserId: "local-user-1",
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
    };

    expect(isChatSharedWorkerEvent(delivery)).toBe(true);
    expect(
      isChatSharedWorkerEvent({
        ...delivery,
        roomId: "room-02",
      }),
    ).toBe(false);
    expect(
      isChatSharedWorkerEvent({
        ...delivery,
        throughBufferSequence: 0,
      }),
    ).toBe(false);
  });
});
