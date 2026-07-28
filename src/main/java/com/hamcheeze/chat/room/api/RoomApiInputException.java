package com.hamcheeze.chat.room.api;

import org.springframework.http.HttpStatus;

import java.util.Objects;

public final class RoomApiInputException
        extends RuntimeException {

    private final RoomApiErrorCode code;
    private final HttpStatus status;

    public RoomApiInputException(
            RoomApiErrorCode code,
            HttpStatus status,
            String message
    ) {
        super(message);
        this.code = Objects.requireNonNull(code, "code");
        this.status = Objects.requireNonNull(status, "status");
    }

    public RoomApiErrorCode code() {
        return code;
    }

    public HttpStatus status() {
        return status;
    }
}
