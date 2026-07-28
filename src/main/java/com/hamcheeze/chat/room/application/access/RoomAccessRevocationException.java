package com.hamcheeze.chat.room.application.access;

public final class RoomAccessRevocationException
        extends RuntimeException {

    public RoomAccessRevocationException(String message) {
        super(message);
    }

    public RoomAccessRevocationException(
            String message,
            Throwable cause
    ) {
        super(message, cause);
    }
}
