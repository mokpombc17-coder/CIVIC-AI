package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;

import java.util.Objects;

public record RoomMessageAccess(
        RoomAuthorizationDecision decision,
        Long messageVisibleAfterSequence
) {

    public RoomMessageAccess {
        Objects.requireNonNull(decision, "decision");
        if (decision == RoomAuthorizationDecision.ALLOWED) {
            if (messageVisibleAfterSequence == null
                    || messageVisibleAfterSequence < 0) {
                throw new IllegalArgumentException(
                        "Allowed message access requires a valid boundary");
            }
        } else if (messageVisibleAfterSequence != null) {
            throw new IllegalArgumentException(
                    "Denied message access must not expose a boundary");
        }
    }

    public static RoomMessageAccess allowed(long boundary) {
        return new RoomMessageAccess(
                RoomAuthorizationDecision.ALLOWED,
                boundary);
    }

    public static RoomMessageAccess forbidden() {
        return new RoomMessageAccess(
                RoomAuthorizationDecision.FORBIDDEN,
                null);
    }

    public static RoomMessageAccess unavailable() {
        return new RoomMessageAccess(
                RoomAuthorizationDecision.UNAVAILABLE,
                null);
    }
}
