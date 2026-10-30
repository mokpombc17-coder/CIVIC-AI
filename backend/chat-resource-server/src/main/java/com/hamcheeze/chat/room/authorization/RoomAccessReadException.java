package com.hamcheeze.chat.room.authorization;

public final class RoomAccessReadException extends RuntimeException {

    public RoomAccessReadException(String message) {
        super(message);
    }

    public RoomAccessReadException(String message, Throwable cause) {
        super(message, cause);
    }
}
