package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

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
    private static final String UPDATED_SOURCE =
            "chat-message-updated:message-1:v2";
    private static final String DELETED_SOURCE =
            "chat-message-deleted:message-1:v2";

    @Test
    void acceptsValidCreateUpdateAndDeleteAndDefensivelyCopiesSources() {
        List<String> mutable = new ArrayList<>(List.of(CREATED_SOURCE));
        RoomInboxEvent created = created(
                1, EVENT_ID, RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "room-1", "Room", NOW, mutable, 1, hint());
        mutable.clear();

        assertThat(created.sourceEventIds())
                .containsExactly(CREATED_SOURCE);
        assertThat(created.notificationHint().senderMembershipId())
                .isEqualTo("membership-sender-1");
        assertThat(deleted(
                null, null, null, List.of(DELETED_SOURCE)).cause())
                .isEqualTo(RoomInboxEvent.Cause.MESSAGE_DELETED);
        assertThat(updated(
                null, null, null, List.of(UPDATED_SOURCE)).cause())
                .isEqualTo(RoomInboxEvent.Cause.MESSAGE_UPDATED);
    }

    @Test
    void serializesUpdateAsInvalidationOnlyVersionOneShape()
            throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        JsonNode json = objectMapper.readTree(
                objectMapper.writeValueAsBytes(updated(
                        null,
                        null,
                        null,
                        List.of(UPDATED_SOURCE))));

        assertThat(json.get("eventVersion").asInt()).isEqualTo(1);
        assertThat(json.get("eventType").asText())
                .isEqualTo(RoomInboxEvent.EVENT_TYPE);
        assertThat(json.get("cause").asText())
                .isEqualTo("MESSAGE_UPDATED");
        assertThat(json.get("sourceEventIds").get(0).asText())
                .isEqualTo(UPDATED_SOURCE);
        assertThat(json.get("roomNameHint").isNull()).isTrue();
        assertThat(json.get("coalescedCreateCount").isNull()).isTrue();
        assertThat(json.get("notificationHint").isNull()).isTrue();
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
    void enforcesPublicSourceEventHardLimit() {
        List<String> maximum = java.util.stream.IntStream.range(
                        0, RoomInboxEvent.MAX_SOURCE_EVENT_IDS)
                .mapToObj(value -> "chat-message-created:message-" + value)
                .toList();
        assertThat(createdWith(
                "Room", maximum.size(), hint(), maximum)
                .sourceEventIds()).hasSize(
                RoomInboxEvent.MAX_SOURCE_EVENT_IDS);

        List<String> oversized = java.util.stream.IntStream.rangeClosed(
                        0, RoomInboxEvent.MAX_SOURCE_EVENT_IDS)
                .mapToObj(value -> "chat-message-created:message-" + value)
                .toList();
        assertInvalid(() -> createdWith(
                "Room", oversized.size(), hint(), oversized));
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
    void rejectsMalformedUpdateFieldsAndSourceSets() {
        List<String> maximum = java.util.stream.IntStream.range(
                        0, RoomInboxEvent.MAX_SOURCE_EVENT_IDS)
                .mapToObj(value -> "chat-message-updated:message-"
                        + value + ":v2")
                .toList();
        assertThat(updated(
                null, null, null, maximum).sourceEventIds())
                .hasSize(RoomInboxEvent.MAX_SOURCE_EVENT_IDS);
        assertInvalid(() -> updated(
                "Room", null, null, List.of(UPDATED_SOURCE)));
        assertInvalid(() -> updated(
                null, 1, null, List.of(UPDATED_SOURCE)));
        assertInvalid(() -> updated(
                null, null, hint(), List.of(UPDATED_SOURCE)));
        assertInvalid(() -> updated(
                null, null, null, List.of(CREATED_SOURCE)));
        assertInvalid(() -> updated(
                null, null, null, List.of(DELETED_SOURCE)));
        assertInvalid(() -> updated(
                null, null, null, List.of()));
        assertInvalid(() -> updated(
                null, null, null,
                List.of(UPDATED_SOURCE, UPDATED_SOURCE)));
        List<String> oversized = java.util.stream.IntStream.rangeClosed(
                        0, RoomInboxEvent.MAX_SOURCE_EVENT_IDS)
                .mapToObj(value -> "chat-message-updated:message-"
                        + value + ":v2")
                .toList();
        assertInvalid(() -> updated(
                null, null, null, oversized));
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

    @Test
    void maximumCreateAndDeleteJsonFitStompMessageLimit()
            throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        int maxBytes = new ChatContentProperties()
                .getMaxStompMessageBytes();
        List<String> createSources = java.util.stream.IntStream.range(
                        0, RoomInboxEvent.MAX_SOURCE_EVENT_IDS)
                .mapToObj(value -> "chat-message-created:"
                        + String.format("%064d", value))
                .toList();
        List<String> deleteSources = java.util.stream.IntStream.range(
                        0, RoomInboxEvent.MAX_SOURCE_EVENT_IDS)
                .mapToObj(value -> "chat-message-deleted:"
                        + String.format("%064d", value)
                        + ":v9223372036854775807")
                .toList();
        RoomInboxEvent create = created(
                RoomInboxEvent.CURRENT_EVENT_VERSION,
                EVENT_ID,
                RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_CREATED,
                "r".repeat(64),
                "R".repeat(Room.MAX_NAME_LENGTH),
                NOW,
                createSources,
                createSources.size(),
                new RoomInboxNotificationHint(
                        "m".repeat(64),
                        Long.MAX_VALUE,
                        "s".repeat(64),
                        "membership-1",
                        NOW,
                        "😀".repeat(30),
                        true));
        RoomInboxEvent delete = deleted(
                null, null, null, deleteSources);

        int createBytes = objectMapper.writeValueAsBytes(create).length;
        int deleteBytes = objectMapper.writeValueAsBytes(delete).length;
        assertThat(createBytes).isLessThan(maxBytes);
        assertThat(deleteBytes).isLessThan(maxBytes);
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

    private RoomInboxEvent updated(
            String roomName,
            Integer count,
            RoomInboxNotificationHint hint,
            List<String> sources
    ) {
        return new RoomInboxEvent(
                1,
                EVENT_ID,
                RoomInboxEvent.EVENT_TYPE,
                RoomInboxEvent.Cause.MESSAGE_UPDATED,
                "room-1",
                roomName,
                NOW,
                sources,
                count,
                hint);
    }

    private RoomInboxNotificationHint hint() {
        return new RoomInboxNotificationHint(
                "message-1",
                1,
                "sender-1",
                "membership-sender-1",
                NOW,
                "preview",
                false);
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
                "membership-sender-1",
                createdAt,
                preview,
                false));
    }

    private void assertInvalid(Runnable operation) {
        assertThatThrownBy(operation::run)
                .isInstanceOf(IllegalArgumentException.class);
    }
}
