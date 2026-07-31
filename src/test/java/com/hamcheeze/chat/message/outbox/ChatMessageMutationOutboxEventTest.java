package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageMutationOutboxEventTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-31T01:00:00Z");
    private static final Instant UPDATED_AT =
            Instant.parse("2026-07-31T02:00:00Z");

    @Test
    void createsDeterministicUpdateAndDeleteEvents() {
        ChatMessage updated = new ChatMessage(
                "message-1",
                "room-1",
                10,
                "user-1",
                "client-1",
                "edited",
                MessageState.ACTIVE,
                2,
                CREATED_AT,
                UPDATED_AT,
                null);
        ChatMessage deleted = new ChatMessage(
                "message-1",
                "room-1",
                10,
                "user-1",
                "client-1",
                null,
                MessageState.DELETED_BY_AUTHOR,
                3,
                CREATED_AT,
                UPDATED_AT,
                UPDATED_AT);

        ChatMessageOutboxEvent update =
                ChatMessageOutboxEvent.messageUpdated(updated);
        ChatMessageOutboxEvent delete =
                ChatMessageOutboxEvent.messageDeleted(deleted);

        assertThat(update.eventId())
                .isEqualTo("chat-message-updated:message-1:v2");
        assertThat(update.eventType())
                .isEqualTo("CHAT_MESSAGE_UPDATED");
        assertThat(update.occurredAt()).isEqualTo(UPDATED_AT);
        assertThat(update.roomSequence()).isEqualTo(10);
        assertThat(delete.eventId())
                .isEqualTo("chat-message-deleted:message-1:v3");
        assertThat(delete.eventType())
                .isEqualTo("CHAT_MESSAGE_DELETED");
        assertThat(delete.payload().content()).isNull();
        assertThat(delete.payload().messageVersion()).isEqualTo(3);
    }

    @Test
    void decodeLegacyCreatePayloadUsesVersionOneDefaults() {
        ClaimedChatMessageOutboxEvent claimed =
                new ClaimedChatMessageOutboxEvent(
                        "chat-message-created:message-1",
                        1,
                        1,
                        "CHAT_MESSAGE",
                        "message-1",
                        1,
                        "CHAT_MESSAGE_CREATED",
                        "room-1",
                        10L,
                        new ClaimedChatMessageOutboxEvent.Payload(
                                "message-1",
                                "room-1",
                                10L,
                                "user-1",
                                "client-1",
                                "hello",
                                CREATED_AT),
                        CREATED_AT);

        var payload = claimed.decodeEnvelope().payload();

        assertThat(payload.state()).isEqualTo(MessageState.ACTIVE);
        assertThat(payload.messageVersion()).isEqualTo(1);
        assertThat(payload.updatedAt()).isEqualTo(CREATED_AT);
        assertThat(payload.deletedAt()).isNull();
    }

    @Test
    void malformedMutationMetadataFailsClosed() {
        ClaimedChatMessageOutboxEvent claimed =
                new ClaimedChatMessageOutboxEvent(
                        "chat-message-updated:message-1:v3",
                        1,
                        1,
                        "CHAT_MESSAGE",
                        "message-1",
                        1,
                        "CHAT_MESSAGE_UPDATED",
                        "room-1",
                        10L,
                        new ClaimedChatMessageOutboxEvent.Payload(
                                "message-1",
                                "room-1",
                                10L,
                                "user-1",
                                "client-1",
                                "edited",
                                MessageState.ACTIVE,
                                2L,
                                CREATED_AT,
                                UPDATED_AT,
                                null),
                        UPDATED_AT);

        assertThatThrownBy(claimed::decodeEnvelope)
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void mutationTimestampAndDeleteStateMismatchFailClosed() {
        ClaimedChatMessageOutboxEvent wrongTimestamp =
                new ClaimedChatMessageOutboxEvent(
                        "chat-message-updated:message-1:v2",
                        1,
                        1,
                        "CHAT_MESSAGE",
                        "message-1",
                        1,
                        "CHAT_MESSAGE_UPDATED",
                        "room-1",
                        10L,
                        new ClaimedChatMessageOutboxEvent.Payload(
                                "message-1",
                                "room-1",
                                10L,
                                "user-1",
                                "client-1",
                                "edited",
                                MessageState.ACTIVE,
                                2L,
                                CREATED_AT,
                                UPDATED_AT,
                                null),
                        CREATED_AT);
        ClaimedChatMessageOutboxEvent wrongDeleteState =
                new ClaimedChatMessageOutboxEvent(
                        "chat-message-deleted:message-1:v2",
                        1,
                        1,
                        "CHAT_MESSAGE",
                        "message-1",
                        1,
                        "CHAT_MESSAGE_DELETED",
                        "room-1",
                        10L,
                        new ClaimedChatMessageOutboxEvent.Payload(
                                "message-1",
                                "room-1",
                                10L,
                                "user-1",
                                "client-1",
                                "still visible",
                                MessageState.ACTIVE,
                                2L,
                                CREATED_AT,
                                UPDATED_AT,
                                null),
                        UPDATED_AT);

        assertThatThrownBy(wrongTimestamp::decodeEnvelope)
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(wrongDeleteState::decodeEnvelope)
                .isInstanceOf(IllegalArgumentException.class);
    }
}
