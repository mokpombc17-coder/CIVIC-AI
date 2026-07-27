package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
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
        Instant createdAt
) {

    public static final String COLLECTION_NAME = "chat_messages";
    public static final int CURRENT_SCHEMA_VERSION = 1;

    @PersistenceCreator
    public MongoChatMessageDocument {
        Objects.requireNonNull(messageId, "messageId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(senderUserId, "senderUserId");
        Objects.requireNonNull(clientMessageId, "clientMessageId");
        Objects.requireNonNull(content, "content");
        Objects.requireNonNull(createdAt, "createdAt");
        if (schemaVersion < 1) {
            throw new IllegalArgumentException(
                    "schemaVersion must be at least 1");
        }
        if (roomSequence < 1) {
            throw new IllegalArgumentException(
                    "roomSequence must be at least 1");
        }
    }

    ChatMessage toDomain() {
        return new ChatMessage(
                messageId,
                roomId,
                roomSequence,
                senderUserId,
                clientMessageId,
                content,
                createdAt);
    }
}
