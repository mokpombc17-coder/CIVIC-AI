package com.hamcheeze.chat.room.creation;

import java.util.Objects;

public record RoomCreationRequestExecution(
        RoomCreationRequest request,
        boolean replayed
) {

    public RoomCreationRequestExecution {
        Objects.requireNonNull(request, "request");
    }
}
