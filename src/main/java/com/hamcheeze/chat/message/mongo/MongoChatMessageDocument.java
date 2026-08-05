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
        String clientMessageId,
        String content,
        String creationContentFingerprint,
        MessageState state,
        Boolean countable,
        Long messageVersion,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public static final String COLLECTION_NAME = "chat_messages";
    public static final int CURRENT_SCHEMA_VERSION = 3;

    @PersistenceCreator
    public MongoChatMessageDocument {
        Objects.requireNonNull(messageId, "messageId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(senderUserId, "senderUserId");
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
                clientMessageId,
                content,
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
                clientMessageId,
                content,
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
                clientMessageId,
                content,
                state,
                countable,
                messageVersion,
                createdAt,
                updatedAt,
                deletedAt);
    }

    static MongoChatMessageDocument fromDomain(
            ChatMessage message,
            String creationContentFingerprint
    ) {
        Objects.requireNonNull(message, "message");
        Objects.requireNonNull(
                creationContentFingerprint,
                "creationContentFingerprint");
        return new MongoChatMessageDocument(
                message.messageId(),
                CURRENT_SCHEMA_VERSION,
                message.roomId(),
                message.roomSequence(),
                message.senderUserId(),
                message.clientMessageId(),
                message.content(),
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
