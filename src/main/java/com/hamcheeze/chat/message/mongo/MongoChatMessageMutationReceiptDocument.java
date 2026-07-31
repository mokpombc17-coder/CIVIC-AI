package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageMutationResult;
import com.hamcheeze.chat.message.MessageMutationCommandType;
import com.hamcheeze.chat.message.MessageMutationOutcome;
import com.hamcheeze.chat.message.MessageState;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Objects;

@Document(collection =
        MongoChatMessageMutationReceiptDocument.COLLECTION_NAME)
public record MongoChatMessageMutationReceiptDocument(
        @MongoId(FieldType.STRING)
        String receiptId,
        int schemaVersion,
        String actorUserId,
        String clientMutationId,
        MessageMutationCommandType commandType,
        String roomId,
        String messageId,
        String requestFingerprint,
        MessageMutationOutcome outcome,
        Long roomSequence,
        Long messageVersion,
        MessageState messageState,
        Instant processedAt
) {
    public static final String COLLECTION_NAME =
            "chat_message_mutation_receipts";
    public static final int CURRENT_SCHEMA_VERSION = 1;

    public MongoChatMessageMutationReceiptDocument {
        Objects.requireNonNull(receiptId, "receiptId");
        Objects.requireNonNull(actorUserId, "actorUserId");
        Objects.requireNonNull(clientMutationId, "clientMutationId");
        Objects.requireNonNull(commandType, "commandType");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(messageId, "messageId");
        Objects.requireNonNull(requestFingerprint, "requestFingerprint");
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(processedAt, "processedAt");
        if (schemaVersion != CURRENT_SCHEMA_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported mutation receipt schema");
        }
    }

    ChatMessageMutationResult toResult(boolean replayed) {
        return new ChatMessageMutationResult(
                commandType,
                clientMutationId,
                outcome,
                messageId,
                roomSequence,
                messageVersion,
                messageState,
                replayed);
    }
}
