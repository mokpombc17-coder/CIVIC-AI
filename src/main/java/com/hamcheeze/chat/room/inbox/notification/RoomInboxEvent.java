package com.hamcheeze.chat.room.inbox.notification;

import java.time.Instant;
import java.util.List;

public record RoomInboxEvent(
        int eventVersion,
        String eventId,
        String eventType,
        Cause cause,
        String roomId,
        String roomNameHint,
        Instant emittedAt,
        List<String> sourceEventIds,
        Integer coalescedCreateCount,
        RoomInboxNotificationHint notificationHint
) {

    public static final int CURRENT_EVENT_VERSION = 1;
    public static final String EVENT_TYPE = "ROOM_INBOX_INVALIDATED";

    public RoomInboxEvent {
        sourceEventIds = List.copyOf(sourceEventIds);
    }

    public enum Cause {
        MESSAGE_CREATED,
        MESSAGE_DELETED
    }
}
