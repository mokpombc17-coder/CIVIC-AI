package com.hamcheeze.chat.room.query.model;

import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;

import java.util.Objects;

public record RoomCreationRequestView(
        RoomCreationRequest request,
        RoomStatus roomStatus
) {

    public RoomCreationRequestView {
        Objects.requireNonNull(request, "request");
        if (request.status() == RoomCreationRequestStatus.APPROVED) {
            Objects.requireNonNull(roomStatus, "roomStatus");
        } else if (roomStatus != null) {
            throw new IllegalArgumentException(
                    "only an approved request may have a Room status");
        }
    }
}
