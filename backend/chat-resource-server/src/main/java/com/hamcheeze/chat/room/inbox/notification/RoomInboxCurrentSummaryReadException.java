package com.hamcheeze.chat.room.inbox.notification;

public final class RoomInboxCurrentSummaryReadException
        extends RuntimeException {

    private final String failureKind;

    public RoomInboxCurrentSummaryReadException(
            String failureKind,
            Throwable cause
    ) {
        super("Room inbox current summary resolution failed", cause);
        if (failureKind == null || failureKind.isBlank()) {
            throw new IllegalArgumentException(
                    "failureKind must not be blank");
        }
        this.failureKind = failureKind;
    }

    public String failureKind() {
        return failureKind;
    }
}
