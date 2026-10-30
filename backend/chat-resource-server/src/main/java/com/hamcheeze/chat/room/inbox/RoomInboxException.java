package com.hamcheeze.chat.room.inbox;

public final class RoomInboxException extends RuntimeException {

    private final RoomInboxErrorCode code;

    public RoomInboxException(
            RoomInboxErrorCode code,
            String message
    ) {
        super(message);
        this.code = code;
    }

    public RoomInboxException(
            RoomInboxErrorCode code,
            String message,
            Throwable cause
    ) {
        super(message, cause);
        this.code = code;
    }

    public RoomInboxErrorCode code() {
        return code;
    }
}
