package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.message.outbox.ChatMessageOutboxEvent;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

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
    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    public RoomInboxEvent {
        if (eventVersion != CURRENT_EVENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported room inbox event version");
        }
        requireCanonicalUuid(eventId);
        if (!EVENT_TYPE.equals(eventType)) {
            throw new IllegalArgumentException(
                    "Unsupported room inbox event type");
        }
        if (cause == null) {
            throw new IllegalArgumentException(
                    "cause must not be null");
        }
        if (roomId == null || !ROOM_ID.matcher(roomId).matches()) {
            throw new IllegalArgumentException("Invalid roomId");
        }
        if (emittedAt == null) {
            throw new IllegalArgumentException(
                    "emittedAt must not be null");
        }
        if (sourceEventIds == null || sourceEventIds.isEmpty()
                || sourceEventIds.stream().anyMatch(
                value -> value == null || value.isBlank())
                || new HashSet<>(sourceEventIds).size()
                != sourceEventIds.size()) {
            throw new IllegalArgumentException(
                    "Invalid sourceEventIds");
        }
        sourceEventIds = List.copyOf(sourceEventIds);
        switch (cause) {
            case MESSAGE_CREATED -> validateCreated(
                    roomNameHint,
                    sourceEventIds,
                    coalescedCreateCount,
                    notificationHint);
            case MESSAGE_DELETED -> validateDeleted(
                    roomNameHint,
                    sourceEventIds,
                    coalescedCreateCount,
                    notificationHint);
        }
    }

    private static void validateCreated(
            String roomNameHint,
            List<String> sourceEventIds,
            Integer coalescedCreateCount,
            RoomInboxNotificationHint notificationHint
    ) {
        if (roomNameHint == null || roomNameHint.isBlank()
                || coalescedCreateCount == null
                || coalescedCreateCount < 1
                || notificationHint == null
                || sourceEventIds.size() != coalescedCreateCount
                || sourceEventIds.stream().anyMatch(value ->
                !isSource(value, ChatMessageOutboxEvent
                        .MESSAGE_CREATED_ID_PREFIX))) {
            throw new IllegalArgumentException(
                    "Invalid MESSAGE_CREATED inbox event");
        }
    }

    private static void validateDeleted(
            String roomNameHint,
            List<String> sourceEventIds,
            Integer coalescedCreateCount,
            RoomInboxNotificationHint notificationHint
    ) {
        if (roomNameHint != null
                || coalescedCreateCount != null
                || notificationHint != null
                || sourceEventIds.stream().anyMatch(value ->
                !isSource(value, ChatMessageOutboxEvent
                        .MESSAGE_DELETED_ID_PREFIX))) {
            throw new IllegalArgumentException(
                    "Invalid MESSAGE_DELETED inbox event");
        }
    }

    private static boolean isSource(String value, String prefix) {
        return value.startsWith(prefix) && value.length() > prefix.length();
    }

    private static void requireCanonicalUuid(String eventId) {
        try {
            if (eventId == null
                    || !UUID.fromString(eventId).toString()
                    .equals(eventId)) {
                throw new IllegalArgumentException(
                        "eventId must be a canonical UUID");
            }
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "eventId must be a canonical UUID", exception);
        }
    }

    public enum Cause {
        MESSAGE_CREATED,
        MESSAGE_DELETED
    }
}
