package com.hamcheeze.chat.room.application.idempotency;

import com.hamcheeze.chat.room.persistence.RoomCommandType;

import java.time.Instant;
import java.util.Objects;

public record PreparedRoomCommand(
        String requesterUserId,
        String clientRequestId,
        RoomCommandType commandType,
        String fingerprint,
        String receiptId,
        Instant completedAt,
        Instant expiresAt,
        String roomId
) {

    public PreparedRoomCommand {
        requesterUserId = requireNonBlank(
                requesterUserId,
                "requesterUserId");
        clientRequestId =
                RoomClientRequestId.canonicalize(clientRequestId);
        Objects.requireNonNull(commandType, "commandType");
        fingerprint = requireNonBlank(fingerprint, "fingerprint");
        receiptId = requireNonBlank(receiptId, "receiptId");
        Objects.requireNonNull(completedAt, "completedAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
        if (!expiresAt.isAfter(completedAt)) {
            throw new IllegalArgumentException(
                    "expiresAt must be after completedAt");
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
