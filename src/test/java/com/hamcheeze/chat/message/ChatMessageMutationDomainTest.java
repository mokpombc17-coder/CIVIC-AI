package com.hamcheeze.chat.message;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageMutationDomainTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-31T01:00:00Z");
    private static final Instant UPDATED_AT =
            Instant.parse("2026-07-31T02:00:00Z");

    @Test
    void legacyConstructorCreatesActiveVersionOneSnapshot() {
        ChatMessage message = new ChatMessage(
                "message-1",
                "room-1",
                10,
                "user-1",
                "client-1",
                "hello",
                CREATED_AT);

        assertThat(message.state()).isEqualTo(MessageState.ACTIVE);
        assertThat(message.messageVersion()).isEqualTo(1);
        assertThat(message.updatedAt()).isEqualTo(CREATED_AT);
        assertThat(message.deletedAt()).isNull();
    }

    @Test
    void deletedSnapshotRequiresTombstoneInvariants() {
        ChatMessage deleted = new ChatMessage(
                "message-1",
                "room-1",
                10,
                "user-1",
                "client-1",
                null,
                MessageState.DELETED_BY_AUTHOR,
                2,
                CREATED_AT,
                UPDATED_AT,
                UPDATED_AT);

        assertThat(deleted.content()).isNull();
        assertThat(deleted.roomSequence()).isEqualTo(10);
        assertThat(deleted.messageVersion()).isEqualTo(2);

        assertThatThrownBy(() -> new ChatMessage(
                "message-1",
                "room-1",
                10,
                "user-1",
                "client-1",
                "leaked content",
                MessageState.DELETED_BY_AUTHOR,
                2,
                CREATED_AT,
                UPDATED_AT,
                UPDATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
