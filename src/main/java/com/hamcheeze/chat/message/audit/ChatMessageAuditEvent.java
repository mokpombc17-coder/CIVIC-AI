package com.hamcheeze.chat.message.audit;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;

import java.time.Instant;
import java.util.Objects;

public record ChatMessageAuditEvent(
        String auditEventId,
        int schemaVersion,
        String roomId,
        long roomChangeSequence,
        ChatMessageAuditEventType eventType,
        String messageId,
        long roomSequence,
        long messageVersion,
        String senderMembershipId,
        String senderUserId,
        String actorUserId,
        ChatMessageAuditActorType actorType,
        Instant occurredAt,
        ChatMessageAuditSnapshot before,
        ChatMessageAuditSnapshot after
) {

    public static final int CURRENT_SCHEMA_VERSION = 1;
    private static final String EVENT_ID_PREFIX = "chat-message-audit:";

    public ChatMessageAuditEvent {
        requireNonBlank(auditEventId, "auditEventId");
        requireNonBlank(roomId, "roomId");
        requireNonBlank(messageId, "messageId");
        requireNonBlank(senderMembershipId, "senderMembershipId");
        requireNonBlank(senderUserId, "senderUserId");
        requireNonBlank(actorUserId, "actorUserId");
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(actorType, "actorType");
        Objects.requireNonNull(occurredAt, "occurredAt");
        Objects.requireNonNull(after, "after");
        if (schemaVersion != CURRENT_SCHEMA_VERSION
                || roomChangeSequence < 1
                || roomSequence < 1
                || messageVersion < 1) {
            throw new IllegalArgumentException(
                    "Unsupported or malformed audit event");
        }
        if (!auditEventId.equals(eventId(messageId, messageVersion))
                || messageVersion != after.messageVersion()) {
            throw new IllegalArgumentException(
                    "Audit event identity does not match its snapshot");
        }
        validateTransition(eventType, before, after, occurredAt);
    }

    public static ChatMessageAuditEvent created(
            ChatMessage created,
            long roomChangeSequence,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        Objects.requireNonNull(created, "created");
        return event(
                ChatMessageAuditEventType.MESSAGE_CREATED,
                created,
                roomChangeSequence,
                actorUserId,
                actorType,
                created.createdAt(),
                null,
                ChatMessageAuditSnapshot.from(created));
    }

    public static ChatMessageAuditEvent updated(
            ChatMessage before,
            ChatMessage after,
            long roomChangeSequence,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        requireSameMessage(before, after);
        return event(
                ChatMessageAuditEventType.MESSAGE_UPDATED,
                after,
                roomChangeSequence,
                actorUserId,
                actorType,
                after.updatedAt(),
                ChatMessageAuditSnapshot.from(before),
                ChatMessageAuditSnapshot.from(after));
    }

    public static ChatMessageAuditEvent deleted(
            ChatMessage before,
            ChatMessage after,
            long roomChangeSequence,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        requireSameMessage(before, after);
        return event(
                ChatMessageAuditEventType.MESSAGE_DELETED,
                after,
                roomChangeSequence,
                actorUserId,
                actorType,
                after.deletedAt(),
                ChatMessageAuditSnapshot.from(before),
                ChatMessageAuditSnapshot.from(after));
    }

    public static String eventId(String messageId, long messageVersion) {
        requireNonBlank(messageId, "messageId");
        if (messageVersion < 1) {
            throw new IllegalArgumentException(
                    "messageVersion must be at least 1");
        }
        return EVENT_ID_PREFIX + messageId + ":v" + messageVersion;
    }

    private static ChatMessageAuditEvent event(
            ChatMessageAuditEventType eventType,
            ChatMessage message,
            long roomChangeSequence,
            String actorUserId,
            ChatMessageAuditActorType actorType,
            Instant occurredAt,
            ChatMessageAuditSnapshot before,
            ChatMessageAuditSnapshot after
    ) {
        return new ChatMessageAuditEvent(
                eventId(message.messageId(), message.messageVersion()),
                CURRENT_SCHEMA_VERSION,
                message.roomId(),
                roomChangeSequence,
                eventType,
                message.messageId(),
                message.roomSequence(),
                message.messageVersion(),
                message.senderMembershipId(),
                message.senderUserId(),
                actorUserId,
                actorType,
                occurredAt,
                before,
                after);
    }

    private static void validateTransition(
            ChatMessageAuditEventType eventType,
            ChatMessageAuditSnapshot before,
            ChatMessageAuditSnapshot after,
            Instant occurredAt
    ) {
        switch (eventType) {
            case MESSAGE_CREATED -> {
                if (before != null
                        || after.state() != MessageState.ACTIVE
                        || after.messageVersion() != 1
                        || !occurredAt.equals(after.createdAt())) {
                    throw new IllegalArgumentException(
                            "Malformed message-created audit event");
                }
            }
            case MESSAGE_UPDATED -> {
                if (before == null
                        || before.state() != MessageState.ACTIVE
                        || after.state() != MessageState.ACTIVE
                        || after.messageVersion()
                        != before.messageVersion() + 1
                        || !occurredAt.equals(after.updatedAt())) {
                    throw new IllegalArgumentException(
                            "Malformed message-updated audit event");
                }
            }
            case MESSAGE_DELETED -> {
                if (before == null
                        || before.state() != MessageState.ACTIVE
                        || after.state()
                        != MessageState.DELETED_BY_AUTHOR
                        || after.messageVersion()
                        != before.messageVersion() + 1
                        || !occurredAt.equals(after.updatedAt())
                        || !occurredAt.equals(after.deletedAt())) {
                    throw new IllegalArgumentException(
                            "Malformed message-deleted audit event");
                }
            }
        }
    }

    private static void requireSameMessage(
            ChatMessage before,
            ChatMessage after
    ) {
        Objects.requireNonNull(before, "before");
        Objects.requireNonNull(after, "after");
        if (!before.messageId().equals(after.messageId())
                || !before.roomId().equals(after.roomId())
                || before.roomSequence() != after.roomSequence()
                || !before.senderMembershipId().equals(
                        after.senderMembershipId())
                || !before.senderUserId().equals(after.senderUserId())) {
            throw new IllegalArgumentException(
                    "Audit transition changed immutable message identity");
        }
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
