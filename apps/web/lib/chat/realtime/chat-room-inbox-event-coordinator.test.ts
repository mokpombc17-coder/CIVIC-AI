import { describe, expect, it, vi } from "vitest";
import type { ChatRoomInboxEvent } from "./chat-stomp-contracts";
import {
  ChatRoomInboxEventCoordinator,
  ROOM_INBOX_INVALIDATION_DEBOUNCE_MS,
  ROOM_INBOX_INVALIDATION_MAX_WAIT_MS,
  ROOM_INBOX_SOURCE_EVENT_TTL_MS,
} from "./chat-room-inbox-event-coordinator";

const CREATED_EVENT: Extract<ChatRoomInboxEvent, { cause: "MESSAGE_CREATED" }> = {
  eventVersion: 1,
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  eventType: "ROOM_INBOX_INVALIDATED",
  cause: "MESSAGE_CREATED",
  roomId: "room-01",
  roomNameHint: "토론방",
  emittedAt: "2026-08-04T01:10:00Z",
  sourceEventIds: ["source-1"],
  coalescedCreateCount: 1,
  notificationHint: {
    messageId: "message-01",
    messageVersion: 1,
    senderUserId: "user-02",
    messageCreatedAt: "2026-08-04T01:09:59Z",
    preview: "안녕하세요.",
    previewTruncated: false,
  },
};

describe("ChatRoomInboxEventCoordinator", () => {
  it("sourceEventIds 기준으로 중복 CREATE 토스트와 invalidation을 막는다", () => {
    vi.useFakeTimers();
    const onCreate = vi.fn();
    const onInvalidate = vi.fn();
    const coordinator = new ChatRoomInboxEventCoordinator({ onCreate, onInvalidate });

    coordinator.handle(CREATED_EVENT);
    coordinator.handle({ ...CREATED_EVENT, eventId: "550e8400-e29b-41d4-a716-446655440001" });
    vi.advanceTimersByTime(ROOM_INBOX_INVALIDATION_DEBOUNCE_MS);

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledWith(CREATED_EVENT, 1);
    expect(onInvalidate).toHaveBeenCalledOnce();
    coordinator.dispose();
    vi.useRealTimers();
  });

  it("DELETE는 invalidation만 예약한다", () => {
    vi.useFakeTimers();
    const onCreate = vi.fn();
    const onInvalidate = vi.fn();
    const coordinator = new ChatRoomInboxEventCoordinator({ onCreate, onInvalidate });

    coordinator.handle({
      ...CREATED_EVENT,
      eventId: "550e8400-e29b-41d4-a716-446655440002",
      cause: "MESSAGE_DELETED",
      roomNameHint: null,
      sourceEventIds: ["source-delete-1"],
      coalescedCreateCount: null,
      notificationHint: null,
    });
    vi.advanceTimersByTime(ROOM_INBOX_INVALIDATION_DEBOUNCE_MS);

    expect(onCreate).not.toHaveBeenCalled();
    expect(onInvalidate).toHaveBeenCalledOnce();
    coordinator.dispose();
    vi.useRealTimers();
  });

  it("연속 이벤트에서도 maxWait 안에 invalidation한다", () => {
    vi.useFakeTimers();
    const onInvalidate = vi.fn();
    const coordinator = new ChatRoomInboxEventCoordinator({
      onCreate: vi.fn(),
      onInvalidate,
    });

    coordinator.requestInvalidation();
    for (let elapsed = 300; elapsed < ROOM_INBOX_INVALIDATION_MAX_WAIT_MS; elapsed += 300) {
      vi.advanceTimersByTime(300);
      coordinator.requestInvalidation();
    }
    vi.advanceTimersByTime(300);

    expect(onInvalidate).toHaveBeenCalledOnce();
    coordinator.dispose();
    vi.useRealTimers();
  });

  it("TTL이 지난 sourceEventId는 다시 처리한다", () => {
    vi.useFakeTimers();
    let now = 0;
    const onCreate = vi.fn();
    const coordinator = new ChatRoomInboxEventCoordinator({
      now: () => now,
      onCreate,
      onInvalidate: vi.fn(),
    });

    coordinator.handle(CREATED_EVENT);
    now = ROOM_INBOX_SOURCE_EVENT_TTL_MS;
    coordinator.handle(CREATED_EVENT);

    expect(onCreate).toHaveBeenCalledTimes(2);
    coordinator.dispose();
    vi.useRealTimers();
  });
});
