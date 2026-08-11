package com.hamcheeze.chat.message.audit;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessageAuditEventTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-10T01:00:00Z");
    private static final Instant UPDATED_AT =
            Instant.parse("2026-08-10T02:00:00Z");
    private static final Instant DELETED_AT =
            Instant.parse("2026-08-10T03:00:00Z");

    @Test
    void createsDeterministicCreateUpdateAndDeleteEvents() {
        ChatMessage created = active("A", 1, CREATED_AT);
        ChatMessage updated = active("B", 2, UPDATED_AT);
        ChatMessage deleted = deleted(3, DELETED_AT);

        ChatMessageAuditEvent create = ChatMessageAuditEvent.created(
                created,
                1,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);
        ChatMessageAuditEvent update = ChatMessageAuditEvent.updated(
                created,
                updated,
                2,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);
        ChatMessageAuditEvent delete = ChatMessageAuditEvent.deleted(
                updated,
                deleted,
                3,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT);

        assertThat(create.auditEventId())
                .isEqualTo("chat-message-audit:message-1:v1");
        assertThat(create.before()).isNull();
        assertThat(create.after().content()).isEqualTo("A");
        assertThat(update.before().content()).isEqualTo("A");
        assertThat(update.after().content()).isEqualTo("B");
        assertThat(delete.before().content()).isEqualTo("B");
        assertThat(delete.after().content()).isNull();
        assertThat(delete.after().state())
                .isEqualTo(MessageState.DELETED_BY_AUTHOR);
    }

    @Test
    void rejectsDiscontinuousUpdateVersion() {
        ChatMessage created = active("A", 1, CREATED_AT);
        ChatMessage versionThree = active("C", 3, UPDATED_AT);

        assertThatThrownBy(() -> ChatMessageAuditEvent.updated(
                created,
                versionThree,
                2,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsMalformedDeletedSnapshot() {
        assertThatThrownBy(() -> new ChatMessageAuditSnapshot(
                "secret",
                MessageState.DELETED_BY_AUTHOR,
                true,
                2,
                CREATED_AT,
                DELETED_AT,
                DELETED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static ChatMessage active(
            String content,
            long version,
            Instant updatedAt
    ) {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "membership-1",
                "client-1",
                content,
                MessageState.ACTIVE,
                true,
                version,
                CREATED_AT,
                updatedAt,
                null);
    }

    private static ChatMessage deleted(
            long version,
            Instant deletedAt
    ) {
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
                version,
                CREATED_AT,
                deletedAt,
                deletedAt);
    }
}
