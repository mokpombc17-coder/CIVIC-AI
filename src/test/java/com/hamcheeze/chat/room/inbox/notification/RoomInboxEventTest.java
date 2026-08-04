package com.hamcheeze.chat.room.inbox.notification;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomInboxEventTest {

    private static final Instant NOW =
            Instant.parse("2026-08-04T00:00:00Z");
    private static final String EVENT_ID =
            "550e8400-e29b-41d4-a716-446655440000";
    private static final String CREATED_SOURCE =
            "chat-message-created:message-1";
    private static final String DELETED_SOURCE =
            "chat-message-deleted:message-1:v2";

    @Test
    void acceptsValidCreateAndDeleteAndDefensivelyCopiesSources() {
        List<String> mutable = new ArrayList<>(List.of(CREATED_SOURCE));
        RoomInboxEvent created = created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", NOW, mutable, 1, hint());
        mutable.clear();

        assertThat(created.sourceEventIds())
                .containsExactly(CREATED_SOURCE);
        assertThat(deleted(
                null, null, null, List.of(DELETED_SOURCE)).cause())
                .isEqualTo(RoomInboxEvent.Cause.MESSAGE_DELETED);
    }

    @Test
    void rejectsMalformedCommonFields() {
        assertInvalid(() -> created(
                2, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", NOW,
                List.of(CREATED_SOURCE), 1, hint()));
        assertInvalid(() -> created(
                1, "not-a-uuid", RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", NOW,
                List.of(CREATED_SOURCE), 1, hint()));
        assertInvalid(() -> created(
                1, EVENT_ID, "WRONG",
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", NOW,
                List.of(CREATED_SOURCE), 1, hint()));
        assertInvalid(() -> created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                null, "room-1", "Room", NOW,
                List.of(CREATED_SOURCE), 1, hint()));
        assertInvalid(() -> created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                " ", "Room", NOW,
                List.of(CREATED_SOURCE), 1, hint()));
        assertInvalid(() -> created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", null,
                List.of(CREATED_SOURCE), 1, hint()));
        assertInvalid(() -> created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", NOW,
                List.of(), 1, hint()));
        assertInvalid(() -> created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", NOW,
                List.of(" "), 1, hint()));
        assertInvalid(() -> created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", NOW,
                List.of(CREATED_SOURCE, CREATED_SOURCE), 2, hint()));
    }

    @Test
    void rejectsMalformedCreateFields() {
        assertInvalid(() -> createdWith(
                null, 1, hint(), List.of(CREATED_SOURCE)));
        assertInvalid(() -> createdWith(
                "Room", 0, hint(), List.of(CREATED_SOURCE)));
        assertInvalid(() -> createdWith(
                "Room", 1, null, List.of(CREATED_SOURCE)));
        assertInvalid(() -> createdWith(
                "Room", 2, hint(), List.of(CREATED_SOURCE)));
        assertInvalid(() -> createdWith(
                "Room", 1, hint(), List.of(DELETED_SOURCE)));
    }

    @Test
    void rejectsMalformedDeleteFields() {
        assertInvalid(() -> deleted(
                "Room", null, null, List.of(DELETED_SOURCE)));
        assertInvalid(() -> deleted(
                null, 1, null, List.of(DELETED_SOURCE)));
        assertInvalid(() -> deleted(
                null, null, hint(), List.of(DELETED_SOURCE)));
        assertInvalid(() -> deleted(
                null, null, null, List.of(CREATED_SOURCE)));
    }

    @Test
    void notificationHintRejectsMalformedPublicPayload() {
        assertHintInvalid(null, 1, "sender", NOW, "preview");
        assertHintInvalid("message", 0, "sender", NOW, "preview");
        assertHintInvalid("message", 1, " ", NOW, "preview");
        assertHintInvalid("message", 1, "sender", null, "preview");
        assertHintInvalid("message", 1, "sender", NOW, " ");
        assertHintInvalid("message", 1, "sender", NOW, "line\nnext");
        assertHintInvalid("message", 1, "sender", NOW, "tab\tvalue");
        assertHintInvalid(
                "message", 1, "sender", NOW, "가".repeat(31));
    }

    private RoomInboxEvent createdWith(
            String roomName,
            Integer count,
            RoomInboxNotificationHint hint,
            List<String> sources
    ) {
        return created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", roomName, NOW, sources, count, hint);
    }

    private RoomInboxEvent created(
            int version,
            String eventId,
            String eventType,
            RoomInboxEvent.Cause cause,
            String roomId,
            String roomName,
            Instant emittedAt,
            List<String> sources,
            Integer count,
            RoomInboxNotificationHint hint
    ) {
        return new RoomInboxEvent(
                version, eventId, eventType, cause, roomId, roomName,
                emittedAt, sources, count, hint);
    }

    private RoomInboxEvent deleted(
            String roomName,
            Integer count,
            RoomInboxNotificationHint hint,
            List<String> sources
    ) {
        return new RoomInboxEvent(
                1,
                EVENT_ID,
                RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_DELETED,
                "room-1",
                roomName,
                NOW,
                sources,
                count,
                hint);
    }

    private RoomInboxNotificationHint hint() {
        return new RoomInboxNotificationHint(
                "message-1", 1, "sender-1", NOW, "preview", false);
    }

    private void assertHintInvalid(
            String messageId,
            long version,
            String sender,
            Instant createdAt,
            String preview
    ) {
        assertInvalid(() -> new RoomInboxNotificationHint(
                messageId,
                version,
                sender,
                createdAt,
                preview,
                false));
    }

    private void assertInvalid(Runnable operation) {
        assertThatThrownBy(operation::run)
                .isInstanceOf(IllegalArgumentException.class);
    }
}
