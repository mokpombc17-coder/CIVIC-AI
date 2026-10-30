package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.RoomCreationResult;

import java.util.Objects;

public record ApprovedRoomCreationResult(
        ApprovedRoomCreationOutcome outcome,
        RoomCreationResult creation
) {

    public ApprovedRoomCreationResult {
        Objects.requireNonNull(outcome, "outcome");
        if ((outcome == ApprovedRoomCreationOutcome.CREATED)
                != (creation != null)) {
            throw new IllegalArgumentException(
                    "only a created result contains the Room");
        }
    }

    public static ApprovedRoomCreationResult created(
            RoomCreationResult creation
    ) {
        return new ApprovedRoomCreationResult(
                ApprovedRoomCreationOutcome.CREATED,
                Objects.requireNonNull(creation, "creation"));
    }

    public static ApprovedRoomCreationResult quotaExceeded() {
        return new ApprovedRoomCreationResult(
                ApprovedRoomCreationOutcome
                        .USER_ACTIVE_ROOM_LIMIT_EXCEEDED,
                null);
    }
}
