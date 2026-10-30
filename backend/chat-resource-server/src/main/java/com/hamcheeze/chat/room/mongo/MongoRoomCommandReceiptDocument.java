package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.persistence.RoomCommandReceipt;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;
import java.util.Objects;

@Document(
        collection =
                MongoRoomCommandReceiptDocument.COLLECTION_NAME)
public record MongoRoomCommandReceiptDocument(
        @MongoId(FieldType.STRING)
        String receiptId,
        int schemaVersion,
        String requesterUserId,
        String clientRequestId,
        RoomCommandType commandType,
        String requestFingerprint,
        MongoStoredRoomCommandResultDocument result,
        Instant completedAt,
        Instant expiresAt
) {

    public static final String COLLECTION_NAME =
            "chat_room_command_receipts";
    public static final int CURRENT_SCHEMA_VERSION = 1;

    @PersistenceCreator
    public MongoRoomCommandReceiptDocument {
        Objects.requireNonNull(receiptId, "receiptId");
        Objects.requireNonNull(
                requesterUserId,
                "requesterUserId");
        Objects.requireNonNull(clientRequestId, "clientRequestId");
        Objects.requireNonNull(commandType, "commandType");
        Objects.requireNonNull(
                requestFingerprint,
                "requestFingerprint");
        Objects.requireNonNull(result, "result");
        Objects.requireNonNull(completedAt, "completedAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
    }

    public static MongoRoomCommandReceiptDocument fromDomain(
            RoomCommandReceipt receipt
    ) {
        Objects.requireNonNull(receipt, "receipt");
        return new MongoRoomCommandReceiptDocument(
                receipt.receiptId(),
                CURRENT_SCHEMA_VERSION,
                receipt.requesterUserId(),
                receipt.clientRequestId(),
                receipt.commandType(),
                receipt.requestFingerprint(),
                MongoStoredRoomCommandResultDocument.fromDomain(
                        receipt.result()),
                receipt.completedAt(),
                receipt.expiresAt());
    }

    public RoomCommandReceipt toDomain() {
        requireCurrentSchema();
        return new RoomCommandReceipt(
                receiptId,
                requesterUserId,
                clientRequestId,
                commandType,
                requestFingerprint,
                result.toDomain(),
                completedAt,
                expiresAt);
    }

    private void requireCurrentSchema() {
        if (schemaVersion != CURRENT_SCHEMA_VERSION) {
            throw new IllegalStateException(
                    "Unsupported schemaVersion "
                            + schemaVersion
                            + " in "
                            + COLLECTION_NAME);
        }
    }
}
