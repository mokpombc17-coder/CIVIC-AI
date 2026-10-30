package com.hamcheeze.chat.room.creation;

import java.util.Objects;

public final class RoomCreationRequestException
        extends RuntimeException {

    private final RoomCreationRequestErrorCode code;

    public RoomCreationRequestException(
            RoomCreationRequestErrorCode code,
            String message
    ) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
    }

    public RoomCreationRequestException(
            RoomCreationRequestErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
    }

    public RoomCreationRequestErrorCode code() {
        return code;
    }
}
