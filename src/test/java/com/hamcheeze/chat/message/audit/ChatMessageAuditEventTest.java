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

    @Test
    void rejectsSnapshotWhoseUpdatedAtPrecedesCreatedAt() {
        assertThatThrownBy(() -> activeSnapshot(
                "content",
                true,
                1,
                UPDATED_AT,
                CREATED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsDeletedSnapshotAtVersionOne() {
        assertThatThrownBy(() -> deletedSnapshot(
                true,
                1,
                CREATED_AT,
                DELETED_AT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsCreateWhoseUpdatedAtDiffersFromCreatedAt() {
        ChatMessageAuditSnapshot after = activeSnapshot(
                "content",
                true,
                1,
                CREATED_AT,
                UPDATED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_CREATED,
                null,
                after,
                UPDATED_AT);
    }

    @Test
    void rejectsUpdateThatChangesCreatedAt() {
        ChatMessageAuditSnapshot before = activeSnapshot(
                "before", true, 1, CREATED_AT, CREATED_AT);
        ChatMessageAuditSnapshot after = activeSnapshot(
                "after", true, 2, UPDATED_AT, UPDATED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_UPDATED,
                before,
                after,
                UPDATED_AT);
    }

    @Test
    void rejectsUpdateThatChangesCountable() {
        ChatMessageAuditSnapshot before = activeSnapshot(
                "before", true, 1, CREATED_AT, CREATED_AT);
        ChatMessageAuditSnapshot after = activeSnapshot(
                "after", false, 2, CREATED_AT, UPDATED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_UPDATED,
                before,
                after,
                UPDATED_AT);
    }

    @Test
    void rejectsUpdateWhoseTimestampRegresses() {
        ChatMessageAuditSnapshot before = activeSnapshot(
                "before", true, 1, CREATED_AT, UPDATED_AT);
        ChatMessageAuditSnapshot after = activeSnapshot(
                "after", true, 2, CREATED_AT, CREATED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_UPDATED,
                before,
                after,
                CREATED_AT);
    }

    @Test
    void rejectsUpdateWithoutContentChange() {
        ChatMessageAuditSnapshot before = activeSnapshot(
                "same", true, 1, CREATED_AT, CREATED_AT);
        ChatMessageAuditSnapshot after = activeSnapshot(
                "same", true, 2, CREATED_AT, UPDATED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_UPDATED,
                before,
                after,
                UPDATED_AT);
    }

    @Test
    void rejectsDeleteThatChangesCreatedAt() {
        ChatMessageAuditSnapshot before = activeSnapshot(
                "before", true, 1, CREATED_AT, CREATED_AT);
        ChatMessageAuditSnapshot after = deletedSnapshot(
                true, 2, UPDATED_AT, DELETED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_DELETED,
                before,
                after,
                DELETED_AT);
    }

    @Test
    void rejectsDeleteThatChangesCountable() {
        ChatMessageAuditSnapshot before = activeSnapshot(
                "before", true, 1, CREATED_AT, CREATED_AT);
        ChatMessageAuditSnapshot after = deletedSnapshot(
                false, 2, CREATED_AT, DELETED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_DELETED,
                before,
                after,
                DELETED_AT);
    }

    @Test
    void rejectsDeleteWhoseTimestampRegresses() {
        ChatMessageAuditSnapshot before = activeSnapshot(
                "before", true, 1, CREATED_AT, DELETED_AT);
        ChatMessageAuditSnapshot after = deletedSnapshot(
                true, 2, CREATED_AT, UPDATED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_DELETED,
                before,
                after,
                UPDATED_AT);
    }

    @Test
    void rejectsDeleteWhoseOccurredAtDiffersFromDeletedAt() {
        ChatMessageAuditSnapshot before = activeSnapshot(
                "before", true, 1, CREATED_AT, CREATED_AT);
        ChatMessageAuditSnapshot after = deletedSnapshot(
                true, 2, CREATED_AT, DELETED_AT);

        assertInvalidEvent(
                ChatMessageAuditEventType.MESSAGE_DELETED,
                before,
                after,
                UPDATED_AT);
    }

    @Test
    void rejectsRoomParticipantActorThatDiffersFromSender() {
        ChatMessageAuditSnapshot after = activeSnapshot(
                "content", true, 1, CREATED_AT, CREATED_AT);

        assertThatThrownBy(() -> event(
                ChatMessageAuditEventType.MESSAGE_CREATED,
                null,
                after,
                CREATED_AT,
                "user-2",
                ChatMessageAuditActorType.ROOM_PARTICIPANT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void allowsSuperAdminActorThatDiffersFromSender() {
        ChatMessageAuditSnapshot after = activeSnapshot(
                "content", true, 1, CREATED_AT, CREATED_AT);

        ChatMessageAuditEvent event = event(
                ChatMessageAuditEventType.MESSAGE_CREATED,
                null,
                after,
                CREATED_AT,
                "admin-1",
                ChatMessageAuditActorType.SUPER_ADMIN);

        assertThat(event.actorUserId()).isEqualTo("admin-1");
    }

    private static void assertInvalidEvent(
            ChatMessageAuditEventType eventType,
            ChatMessageAuditSnapshot before,
            ChatMessageAuditSnapshot after,
            Instant occurredAt
    ) {
        assertThatThrownBy(() -> event(
                eventType,
                before,
                after,
                occurredAt,
                "user-1",
                ChatMessageAuditActorType.ROOM_PARTICIPANT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static ChatMessageAuditEvent event(
            ChatMessageAuditEventType eventType,
            ChatMessageAuditSnapshot before,
            ChatMessageAuditSnapshot after,
            Instant occurredAt,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        return new ChatMessageAuditEvent(
                ChatMessageAuditEvent.eventId(
                        "message-1",
                        after.messageVersion()),
                ChatMessageAuditEvent.CURRENT_SCHEMA_VERSION,
                "room-1",
                1,
                eventType,
                "message-1",
                1,
                after.messageVersion(),
                "membership-1",
                "user-1",
                actorUserId,
                actorType,
                occurredAt,
                before,
                after);
    }

    private static ChatMessageAuditSnapshot activeSnapshot(
            String content,
            boolean countable,
            long version,
            Instant createdAt,
            Instant updatedAt
    ) {
        return new ChatMessageAuditSnapshot(
                content,
                MessageState.ACTIVE,
                countable,
                version,
                createdAt,
                updatedAt,
                null);
    }

    private static ChatMessageAuditSnapshot deletedSnapshot(
            boolean countable,
            long version,
            Instant createdAt,
            Instant deletedAt
    ) {
        return new ChatMessageAuditSnapshot(
                null,
                MessageState.DELETED_BY_AUTHOR,
                countable,
                version,
                createdAt,
                deletedAt,
                deletedAt);
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
