package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Objects;

@Document(collection = MongoChatMessageDocument.COLLECTION_NAME)
public record MongoChatMessageDocument(
        @MongoId(FieldType.STRING)
        String messageId,
        int schemaVersion,
        String roomId,
        long roomSequence,
        String senderUserId,
        String senderMembershipId,
        String senderParticipationId,
        String clientMessageId,
        String content,
        String retainedContent,
        String creationContentFingerprint,
        MessageState state,
        Boolean countable,
        Long messageVersion,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public static final String COLLECTION_NAME = "chat_messages";
    public static final int CURRENT_SCHEMA_VERSION = 5;

    @PersistenceCreator
    public MongoChatMessageDocument {
        Objects.requireNonNull(messageId, "messageId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(senderUserId, "senderUserId");
        Objects.requireNonNull(
                senderMembershipId,
                "senderMembershipId");
        if (senderParticipationId == null
                || senderParticipationId.isBlank()) {
            senderParticipationId =
                    com.hamcheeze.chat.room.RoomParticipationIds.legacy(
                            senderMembershipId);
        }
        Objects.requireNonNull(clientMessageId, "clientMessageId");
        Objects.requireNonNull(createdAt, "createdAt");
        if (roomSequence < 1) {
            throw new IllegalArgumentException(
                    "roomSequence must be at least 1");
        }
        if (schemaVersion != CURRENT_SCHEMA_VERSION
                || state == null
                || countable == null
                || messageVersion == null
                || updatedAt == null
                || creationContentFingerprint == null
                || creationContentFingerprint.isBlank()) {
            throw new IllegalArgumentException(
                    "Unsupported or malformed chat message document");
        }
        new ChatMessage(
                messageId,
                roomId,
                roomSequence,
                senderUserId,
                senderMembershipId,
                senderParticipationId,
                clientMessageId,
                content,
                state,
                countable,
                messageVersion,
                createdAt,
                updatedAt,
                deletedAt);
        if (state == MessageState.ACTIVE && retainedContent != null) {
            throw new IllegalArgumentException(
                    "Active message must not retain deleted content");
        }
        if (state == MessageState.DELETED_BY_AUTHOR
                && (retainedContent == null
                || retainedContent.isBlank())) {
            throw new IllegalArgumentException(
                    "Deleted message must retain its last active content");
        }
    }

    public MongoChatMessageDocument(
            String messageId,
            int schemaVersion,
            String roomId,
            long roomSequence,
            String senderUserId,
            String senderMembershipId,
            String clientMessageId,
            String content,
            String retainedContent,
            String creationContentFingerprint,
            MessageState state,
            Boolean countable,
            Long messageVersion,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt
    ) {
        this(
                messageId,
                schemaVersion,
                roomId,
                roomSequence,
                senderUserId,
                senderMembershipId,
                null,
                clientMessageId,
                content,
                retainedContent,
                creationContentFingerprint,
                state,
                countable,
                messageVersion,
                createdAt,
                updatedAt,
                deletedAt);
    }

    public MongoChatMessageDocument(
            String messageId,
            int schemaVersion,
            String roomId,
            long roomSequence,
            String senderUserId,
            String senderMembershipId,
            String clientMessageId,
            String content,
            Instant createdAt
    ) {
        this(
                messageId,
                schemaVersion,
                roomId,
                roomSequence,
                senderUserId,
                senderMembershipId,
                null,
                clientMessageId,
                content,
                null,
                ChatMessageContentFingerprint.of(content),
                MessageState.ACTIVE,
                true,
                1L,
                createdAt,
                createdAt,
                null);
    }

    public ChatMessage toDomain() {
        if (schemaVersion != CURRENT_SCHEMA_VERSION
                || state == null
                || countable == null
                || messageVersion == null
                || updatedAt == null) {
            throw new IllegalArgumentException(
                    "Unsupported or malformed chat message document");
        }
        return new ChatMessage(
                messageId,
                roomId,
                roomSequence,
                senderUserId,
                senderMembershipId,
                senderParticipationId,
                clientMessageId,
                content,
                state,
                countable,
                messageVersion,
                createdAt,
                updatedAt,
                deletedAt);
    }

    static MongoChatMessageDocument fromActiveDomain(
            ChatMessage message,
            String creationContentFingerprint
    ) {
        Objects.requireNonNull(message, "message");
        Objects.requireNonNull(
                creationContentFingerprint,
                "creationContentFingerprint");
        if (message.state() != MessageState.ACTIVE) {
            throw new IllegalArgumentException(
                    "Active mapping requires an active message");
        }
        return new MongoChatMessageDocument(
                message.messageId(),
                CURRENT_SCHEMA_VERSION,
                message.roomId(),
                message.roomSequence(),
                message.senderUserId(),
                message.senderMembershipId(),
                message.senderParticipationId(),
                message.clientMessageId(),
                message.content(),
                null,
                creationContentFingerprint,
                message.state(),
                message.countable(),
                message.messageVersion(),
                message.createdAt(),
                message.updatedAt(),
                message.deletedAt());
    }

    static MongoChatMessageDocument fromDeletedDomain(
            ChatMessage message,
            String retainedContent,
            String creationContentFingerprint
    ) {
        Objects.requireNonNull(message, "message");
        Objects.requireNonNull(retainedContent, "retainedContent");
        Objects.requireNonNull(
                creationContentFingerprint,
                "creationContentFingerprint");
        if (message.state() != MessageState.DELETED_BY_AUTHOR) {
            throw new IllegalArgumentException(
                    "Deleted mapping requires a deleted message");
        }
        return new MongoChatMessageDocument(
                message.messageId(),
                CURRENT_SCHEMA_VERSION,
                message.roomId(),
                message.roomSequence(),
                message.senderUserId(),
                message.senderMembershipId(),
                message.senderParticipationId(),
                message.clientMessageId(),
                message.content(),
                retainedContent,
                creationContentFingerprint,
                message.state(),
                message.countable(),
                message.messageVersion(),
                message.createdAt(),
                message.updatedAt(),
                message.deletedAt());
    }

    String effectiveCreationContentFingerprint() {
        if (creationContentFingerprint != null
                && !creationContentFingerprint.isBlank()) {
            return creationContentFingerprint;
        }
        throw new IllegalArgumentException(
                "Message creation content fingerprint is unavailable");
    }

    boolean hasSameCreationContent(String candidateContent) {
        Objects.requireNonNull(candidateContent, "candidateContent");
        return effectiveCreationContentFingerprint().equals(
                ChatMessageContentFingerprint.of(candidateContent));
    }
}
