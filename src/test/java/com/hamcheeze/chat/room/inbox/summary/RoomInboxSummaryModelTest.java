package com.hamcheeze.chat.room.inbox.summary;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomInboxSummaryModelTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-04T08:30:00Z");

    @Test
    void rejectsUnsupportedSchemaAndMissingRequiredValues() {
        assertThatThrownBy(() -> new MongoRoomInboxSummaryDocument(
                "room-1",
                2,
                active("preview", false),
                CREATED_AT,
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomInboxSummary(
                "room-1", active("preview", false), null, CREATED_AT))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new RoomInboxLastMessage(
                "message-1", 0, 1, MessageState.ACTIVE,
                "preview", false, CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomInboxLastMessage(
                "message-1", 1, 0, MessageState.ACTIVE,
                "preview", false, CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void validatesActiveAndDeletedPreviewShapeFailClosed() {
        assertThatThrownBy(() -> active(null, false))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new RoomInboxLastMessage(
                "message-1",
                1,
                2,
                MessageState.DELETED_BY_AUTHOR,
                "localized deletion",
                false,
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RoomInboxLastMessage(
                "message-1",
                1,
                2,
                MessageState.DELETED_BY_AUTHOR,
                null,
                true,
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static RoomInboxLastMessage active(
            String preview,
            boolean truncated
    ) {
        return new RoomInboxLastMessage(
                "message-1",
                1,
                1,
                MessageState.ACTIVE,
                preview,
                truncated,
                CREATED_AT);
    }
}
