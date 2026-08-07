package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomInboxNotificationIntentTest {

    private static final Instant NOW =
            Instant.parse("2026-08-05T08:00:00Z");

    @Test
    void acceptsCreateUpdateAndDeleteOnly() {
        assertThatCode(() -> intent(
                ChatMessageOutboxEvent.MESSAGE_CREATED,
                ChatMessageOutboxEvent.MESSAGE_CREATED_ID_PREFIX
                        + "message-1"))
                .doesNotThrowAnyException();
        assertThatCode(() -> intent(
                ChatMessageOutboxEvent.MESSAGE_UPDATED,
                ChatMessageOutboxEvent.MESSAGE_UPDATED_ID_PREFIX
                        + "message-1:v2"))
                .doesNotThrowAnyException();
        assertThatCode(() -> intent(
                ChatMessageOutboxEvent.MESSAGE_DELETED,
                ChatMessageOutboxEvent.MESSAGE_DELETED_ID_PREFIX
                        + "message-1:v2"))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> intent("UNKNOWN", "unknown:1"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static RoomInboxNotificationIntent intent(
            String eventType,
            String eventId
    ) {
        return new RoomInboxNotificationIntent(
                eventId,
                eventType,
                new ChatMessagePayload(
                        "message-1",
                        "room-1",
                        1,
                        "membership-sender-1",
                        "client-1",
                        "content",
                        MessageState.ACTIVE,
                        true,
                        eventType.equals(
                                ChatMessageOutboxEvent.MESSAGE_CREATED)
                                ? 1 : 2,
                        NOW,
                        NOW,
                        null));
    }
}
