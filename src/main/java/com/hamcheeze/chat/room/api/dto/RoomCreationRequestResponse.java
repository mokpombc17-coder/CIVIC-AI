package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.creation.RoomCreationRejectionReason;
import com.hamcheeze.chat.room.creation.RoomCreationRequestResultCode;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;

import java.time.Instant;
import java.util.Objects;

public record RoomCreationRequestResponse(
        String clientRequestId,
        RoomCreationRequestResultCode code,
        boolean replayed,
        String creationRequestId,
        RoomCreationRequestStatus status,
        Instant requestedAt,
        Instant resolvedAt,
        String roomId,
        String ownerMembershipId,
        Long roomVersion,
        Long ownerMembershipVersion,
        String rejectionReason
) {

    public RoomCreationRequestResponse {
        clientRequestId = requireText(
                clientRequestId,
                "clientRequestId");
        creationRequestId = requireText(
                creationRequestId,
                "creationRequestId");
        Objects.requireNonNull(code, "code");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(requestedAt, "requestedAt");
        if (code.status() != status) {
            throw new IllegalArgumentException(
                    "code does not match status");
        }
        if (resolvedAt != null
                && resolvedAt.isBefore(requestedAt)) {
            throw new IllegalArgumentException(
                    "resolvedAt must not precede requestedAt");
        }

        switch (status) {
            case PENDING -> {
                requireUnresolved(resolvedAt);
                requireNoRoom(
                        roomId,
                        ownerMembershipId,
                        roomVersion,
                        ownerMembershipVersion);
                requireNoRejectionReason(rejectionReason);
            }
            case APPROVED -> {
                requireResolved(resolvedAt);
                roomId = requireText(roomId, "roomId");
                ownerMembershipId = requireText(
                        ownerMembershipId,
                        "ownerMembershipId");
                requireVersion(roomVersion, "roomVersion");
                requireVersion(
                        ownerMembershipVersion,
                        "ownerMembershipVersion");
                requireNoRejectionReason(rejectionReason);
            }
            case REJECTED -> {
                requireResolved(resolvedAt);
                requireNoRoom(
                        roomId,
                        ownerMembershipId,
                        roomVersion,
                        ownerMembershipVersion);
                rejectionReason =
                        RoomCreationRejectionReason.requireValid(
                                rejectionReason);
            }
            case CANCELED -> {
                requireResolved(resolvedAt);
                requireNoRoom(
                        roomId,
                        ownerMembershipId,
                        roomVersion,
                        ownerMembershipVersion);
                requireNoRejectionReason(rejectionReason);
            }
        }
    }

    private static String requireText(
            String value,
            String field
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
        return value;
    }

    private static void requireResolved(Instant resolvedAt) {
        Objects.requireNonNull(resolvedAt, "resolvedAt");
    }

    private static void requireUnresolved(Instant resolvedAt) {
        if (resolvedAt != null) {
            throw new IllegalArgumentException(
                    "pending request must not be resolved");
        }
    }

    private static void requireNoRoom(
            String roomId,
            String ownerMembershipId,
            Long roomVersion,
            Long ownerMembershipVersion
    ) {
        if (roomId != null
                || ownerMembershipId != null
                || roomVersion != null
                || ownerMembershipVersion != null) {
            throw new IllegalArgumentException(
                    "non-approved request must not reference a room");
        }
    }

    private static void requireVersion(
            Long version,
            String field
    ) {
        if (version == null || version < 0) {
            throw new IllegalArgumentException(
                    field + " must be non-negative");
        }
    }

    private static void requireNoRejectionReason(
            String rejectionReason
    ) {
        if (rejectionReason != null) {
            throw new IllegalArgumentException(
                    "only a rejected request may have a reason");
        }
    }
}
