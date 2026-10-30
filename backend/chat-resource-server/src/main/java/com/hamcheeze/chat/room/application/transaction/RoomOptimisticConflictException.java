package com.hamcheeze.chat.room.application.transaction;

public final class RoomOptimisticConflictException
        extends RuntimeException {

    public RoomOptimisticConflictException(String message) {
        super(message);
    }
}
