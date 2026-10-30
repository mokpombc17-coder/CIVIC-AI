package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MongoChatMessageDocumentTest {

    private static final Instant NOW =
            Instant.parse("2026-08-10T01:00:00Z");

    @Test
    void mapsActiveAndDeletedSchemaVersionFiveDocuments() {
        ChatMessage active = activeMessage();
        MongoChatMessageDocument activeDocument =
                MongoChatMessageDocument.fromActiveDomain(
                        active,
                        "fingerprint");
        ChatMessage deleted = deletedMessage();
        MongoChatMessageDocument deletedDocument =
                MongoChatMessageDocument.fromDeletedDomain(
                        deleted,
                        active.content(),
                        "fingerprint");

        assertThat(activeDocument.schemaVersion()).isEqualTo(5);
        assertThat(activeDocument.retainedContent()).isNull();
        assertThat(deletedDocument.content()).isNull();
        assertThat(deletedDocument.retainedContent())
                .isEqualTo("last active content");
        assertThat(deletedDocument.toDomain().content()).isNull();
    }

    @Test
    void rejectsRetainedContentOnActiveMessage() {
        assertThatThrownBy(() -> document(
                MessageState.ACTIVE,
                "active",
                "retained",
                null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsDeletedMessageWithoutRetainedContent() {
        assertThatThrownBy(() -> document(
                MessageState.DELETED_BY_AUTHOR,
                null,
                null,
                NOW))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsSchemaVersionFour() {
        assertThatThrownBy(() -> new MongoChatMessageDocument(
                "message-1",
                4,
                "room-1",
                1,
                "user-1",
                "membership-1",
                "client-1",
                "active",
                null,
                "fingerprint",
                MessageState.ACTIVE,
                true,
                1L,
                NOW,
                NOW,
                null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static MongoChatMessageDocument document(
            MessageState state,
            String content,
            String retainedContent,
            Instant deletedAt
    ) {
        return new MongoChatMessageDocument(
                "message-1",
                MongoChatMessageDocument.CURRENT_SCHEMA_VERSION,
                "room-1",
                1,
                "user-1",
                "membership-1",
                "client-1",
                content,
                retainedContent,
                "fingerprint",
                state,
                true,
                state == MessageState.ACTIVE ? 1L : 2L,
                NOW,
                NOW,
                deletedAt);
    }

    private static ChatMessage activeMessage() {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "membership-1",
                "client-1",
                "last active content",
                MessageState.ACTIVE,
                true,
                1,
                NOW,
                NOW,
                null);
    }

    private static ChatMessage deletedMessage() {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "membership-1",
                "client-1",
                null,
                MessageState.DELETED_BY_AUTHOR,
                true,
                2,
                NOW,
                NOW,
                NOW);
    }
}
