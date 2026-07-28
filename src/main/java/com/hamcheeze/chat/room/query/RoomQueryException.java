package com.hamcheeze.chat.room.query;

import java.util.Objects;

public final class RoomQueryException extends RuntimeException {

    private final RoomQueryErrorCode code;

    public RoomQueryException(
            RoomQueryErrorCode code,
            String message
    ) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
    }

    public RoomQueryException(
            RoomQueryErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
    }

    public RoomQueryErrorCode code() {
        return code;
    }
}
