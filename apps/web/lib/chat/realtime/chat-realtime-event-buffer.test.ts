import { describe, expect, it } from "vitest";
import type { ChatMessageEvent, ChatRoomEventEnvelope } from "./chat-stomp-contracts";
import { ChatRealtimeEventBuffer } from "./chat-realtime-event-buffer";

describe("ChatRealtimeEventBuffer", () => {
  it("메시지와 방 이벤트를 하나의 도착 순서로 보관한다", () => {
    const buffer = new ChatRealtimeEventBuffer();

    buffer.begin("room-01", 3);
    expect(buffer.appendMessage("room-01", 3, createMessageEvent(11))).toBe(true);
    expect(buffer.appendRoomEvent("room-01", 3, createRoomEvent("event-01"))).toBe(true);

    expect(buffer.getSnapshot()).toMatchObject({
      roomId: "room-01",
      generation: 3,
      overflowed: false,
      invalidEventCount: 0,
      events: [
        {
          bufferSequence: 1,
          kind: "message",
          event: {
            payload: {
              roomSequence: 11,
              countable: true,
            },
          },
        },
        {
          bufferSequence: 2,
          kind: "room",
          event: {
            eventId: "event-01",
          },
        },
      ],
    });
  });

  it("현재 방과 generation이 아닌 이벤트는 버퍼에 섞지 않는다", () => {
    const buffer = new ChatRealtimeEventBuffer();

    buffer.begin("room-01", 3);

    expect(buffer.appendMessage("room-02", 3, createMessageEvent(11, "room-02"))).toBe(false);
    expect(buffer.appendMessage("room-01", 2, createMessageEvent(11))).toBe(false);
    expect(buffer.appendMessage("room-01", 3, createMessageEvent(11, "room-02"))).toBe(false);
    expect(buffer.recordInvalidEvent("room-02", 3)).toBe(false);
    expect(buffer.getSnapshot()?.events).toEqual([]);
  });

  it("새 동기화 주기가 시작되면 이전 방의 이벤트와 오류 표식을 폐기한다", () => {
    const buffer = new ChatRealtimeEventBuffer(1);

    buffer.begin("room-01", 1);
    buffer.appendMessage("room-01", 1, createMessageEvent(1));
    buffer.appendMessage("room-01", 1, createMessageEvent(2));
    buffer.recordInvalidEvent("room-01", 1);

    expect(buffer.getSnapshot()).toMatchObject({
      overflowed: true,
      invalidEventCount: 1,
    });

    buffer.begin("room-02", 2);

    expect(buffer.getSnapshot()).toEqual({
      roomId: "room-02",
      generation: 2,
      events: [],
      throughBufferSequence: 0,
      overflowed: false,
      invalidEventCount: 0,
    });
  });

  it("같은 room과 generation의 재구독에서는 기존 이벤트를 유지한다", () => {
    const buffer = new ChatRealtimeEventBuffer();

    buffer.begin("room-01", 1);
    buffer.appendMessage("room-01", 1, createMessageEvent(1));
    buffer.begin("room-01", 1);

    expect(buffer.getSnapshot()?.events).toHaveLength(1);
  });

  it("용량을 넘으면 최신 이벤트를 유지하고 overflow를 복구 신호로 남긴다", () => {
    const buffer = new ChatRealtimeEventBuffer(2);

    buffer.begin("room-01", 1);
    buffer.appendMessage("room-01", 1, createMessageEvent(1));
    buffer.appendMessage("room-01", 1, createMessageEvent(2));
    buffer.appendMessage("room-01", 1, createMessageEvent(3));

    expect(buffer.getSnapshot()).toMatchObject({
      overflowed: true,
      events: [
        {
          bufferSequence: 2,
          event: { payload: { roomSequence: 2 } },
        },
        {
          bufferSequence: 3,
          event: { payload: { roomSequence: 3 } },
        },
      ],
    });
  });

  it("delivery 확인 시 전달 범위만 제거하고 확인 대기 중 도착한 이벤트는 유지한다", () => {
    const buffer = new ChatRealtimeEventBuffer();

    buffer.begin("room-01", 1);
    buffer.appendMessage("room-01", 1, createMessageEvent(1));
    buffer.recordInvalidEvent("room-01", 1);
    const delivery = buffer.getSnapshot()!;

    buffer.appendMessage("room-01", 1, createMessageEvent(2));
    buffer.recordInvalidEvent("room-01", 1);

    expect(
      buffer.acknowledge(
        delivery.roomId,
        delivery.generation,
        delivery.throughBufferSequence,
        delivery.invalidEventCount,
      ),
    ).toBe(true);
    expect(buffer.getSnapshot()).toMatchObject({
      roomId: "room-01",
      generation: 1,
      throughBufferSequence: 2,
      invalidEventCount: 1,
      events: [
        {
          bufferSequence: 2,
          event: { payload: { roomSequence: 2 } },
        },
      ],
    });
  });

  it("stale delivery 확인은 현재 버퍼를 변경하지 않는다", () => {
    const buffer = new ChatRealtimeEventBuffer();

    buffer.begin("room-01", 2);
    buffer.appendMessage("room-01", 2, createMessageEvent(1));

    expect(buffer.acknowledge("room-01", 1, 1, 0)).toBe(false);
    expect(buffer.getSnapshot()?.events).toHaveLength(1);
  });

  it("현재 lease와 일치하는 clear만 버퍼를 폐기한다", () => {
    const buffer = new ChatRealtimeEventBuffer();

    buffer.begin("room-01", 2);
    buffer.clear("room-01", 1);
    expect(buffer.getSnapshot()).not.toBeNull();

    buffer.clear("room-01", 2);
    expect(buffer.getSnapshot()).toBeNull();
  });
});

function createMessageEvent(roomSequence: number, roomId = "room-01"): ChatMessageEvent {
  return {
    eventVersion: 1,
    eventType: "CHAT_MESSAGE_CREATED",
    payload: {
      messageId: `message-${roomSequence}`,
      roomId,
      roomSequence,
      countable: true,
      senderUserId: "local-user-1",
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

function createRoomEvent(eventId: string): ChatRoomEventEnvelope {
  return {
    eventVersion: 1,
    eventId,
    eventType: "ROOM_MEMBER_JOINED",
    emittedAt: "2026-07-30T00:00:00Z",
    payload: {
      roomId: "room-01",
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
