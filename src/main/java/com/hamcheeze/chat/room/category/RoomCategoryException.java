package com.hamcheeze.chat.room.category;

import java.util.Objects;

public final class RoomCategoryException extends RuntimeException {

    private final RoomCategoryErrorCode code;
    private final Long referencedRoomCount;

    public RoomCategoryException(
            RoomCategoryErrorCode code,
            String message
    ) {
        this(code, message, null, null);
    }

    public RoomCategoryException(
            RoomCategoryErrorCode code,
            String message,
            Throwable cause
    ) {
        this(code, message, null, cause);
    }

    public RoomCategoryException(
            RoomCategoryErrorCode code,
            String message,
            long referencedRoomCount
    ) {
        this(code, message, referencedRoomCount, null);
    }

    private RoomCategoryException(
            RoomCategoryErrorCode code,
            String message,
            Long referencedRoomCount,
            Throwable cause
    ) {
        super(message, cause);
        this.code = Objects.requireNonNull(code, "code");
        this.referencedRoomCount = referencedRoomCount;
    }

    public RoomCategoryErrorCode code() {
        return code;
    }

    public Long referencedRoomCount() {
        return referencedRoomCount;
    }
}
