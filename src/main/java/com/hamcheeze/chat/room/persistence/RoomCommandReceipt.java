package com.hamcheeze.chat.room.persistence;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record RoomCommandReceipt(
        String receiptId,
        String requesterUserId,
        String clientRequestId,
        RoomCommandType commandType,
        String requestFingerprint,
        StoredRoomCommandResult result,
        Instant completedAt,
        Instant expiresAt
) {

    public RoomCommandReceipt {
        receiptId = requireNonBlank(receiptId, "receiptId");
        requesterUserId =
                requireNonBlank(requesterUserId, "requesterUserId");
        clientRequestId = canonicalUuid(clientRequestId);
        Objects.requireNonNull(commandType, "commandType");
        requestFingerprint = requireNonBlank(
                requestFingerprint,
                "requestFingerprint");
        Objects.requireNonNull(result, "result");
        Objects.requireNonNull(completedAt, "completedAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
        if (!expiresAt.isAfter(completedAt)) {
            throw new IllegalArgumentException(
                    "expiresAt must be after completedAt");
        }
    }

    private static String canonicalUuid(String value) {
        if (value == null) {
            throw new IllegalArgumentException(
                    "clientRequestId must be a UUID");
        }
        try {
            String canonical = UUID.fromString(value).toString();
            if (!canonical.equalsIgnoreCase(value)) {
                throw new IllegalArgumentException(
                        "clientRequestId must be a UUID");
            }
            return canonical;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "clientRequestId must be a UUID",
                    exception);
        }
    }

    private static String requireNonBlank(
            String value,
            String fieldName
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
        return value;
    }
}
