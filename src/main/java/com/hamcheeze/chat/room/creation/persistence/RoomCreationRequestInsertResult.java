package com.hamcheeze.chat.room.creation.persistence;

import com.hamcheeze.chat.room.creation.RoomCreationRequest;

import java.util.Objects;

public record RoomCreationRequestInsertResult(
        RoomCreationRequestInsertOutcome outcome,
        RoomCreationRequest request
) {

    public RoomCreationRequestInsertResult {
        Objects.requireNonNull(outcome, "outcome");
        if ((outcome == RoomCreationRequestInsertOutcome
                .PENDING_LIMIT_REACHED) != (request == null)) {
            throw new IllegalArgumentException(
                    "only a pending-limit result omits the request");
        }
    }

    public static RoomCreationRequestInsertResult inserted(
            RoomCreationRequest request
    ) {
        return new RoomCreationRequestInsertResult(
                RoomCreationRequestInsertOutcome.INSERTED,
                Objects.requireNonNull(request, "request"));
    }

    public static RoomCreationRequestInsertResult existing(
            RoomCreationRequest request
    ) {
        return new RoomCreationRequestInsertResult(
                RoomCreationRequestInsertOutcome.EXISTING_REQUEST,
                Objects.requireNonNull(request, "request"));
    }

    public static RoomCreationRequestInsertResult limitReached() {
        return new RoomCreationRequestInsertResult(
                RoomCreationRequestInsertOutcome
                        .PENDING_LIMIT_REACHED,
                null);
    }
}
