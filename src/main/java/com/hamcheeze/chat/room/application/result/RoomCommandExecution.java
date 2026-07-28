package com.hamcheeze.chat.room.application.result;

import com.hamcheeze.chat.room.application.idempotency.RoomClientRequestId;

import java.util.Objects;

public record RoomCommandExecution(
        String clientRequestId,
        RoomCommandResult result,
        boolean replayed
) {

    public RoomCommandExecution {
        clientRequestId =
                RoomClientRequestId.canonicalize(clientRequestId);
        Objects.requireNonNull(result, "result");
    }
}
