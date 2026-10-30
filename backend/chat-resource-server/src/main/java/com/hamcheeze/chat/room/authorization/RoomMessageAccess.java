package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;

import java.util.Objects;

public record RoomMessageAccess(
        RoomAuthorizationDecision decision,
        String membershipId,
        Long membershipVersion,
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
            boolean identityAbsent = membershipId == null
                    && membershipVersion == null;
            boolean identityPresent = membershipId != null
                    && !membershipId.isBlank()
                    && membershipVersion != null
                    && membershipVersion >= 0;
            if (!identityAbsent && !identityPresent) {
                throw new IllegalArgumentException(
                        "Membership identity must be complete");
            }
        } else if (membershipId != null
                || membershipVersion != null
                || messageVisibleAfterSequence != null) {
            throw new IllegalArgumentException(
                    "Denied message access must not expose a boundary");
        }
    }

    public static RoomMessageAccess allowed(long boundary) {
        return new RoomMessageAccess(
                RoomAuthorizationDecision.ALLOWED,
                null,
                null,
                boundary);
    }

    public static RoomMessageAccess allowed(
            String membershipId,
            long membershipVersion,
            long boundary
    ) {
        return new RoomMessageAccess(
                RoomAuthorizationDecision.ALLOWED,
                membershipId,
                membershipVersion,
                boundary);
    }

    public static RoomMessageAccess forbidden() {
        return new RoomMessageAccess(
                RoomAuthorizationDecision.FORBIDDEN,
                null,
                null,
                null);
    }

    public static RoomMessageAccess unavailable() {
        return new RoomMessageAccess(
                RoomAuthorizationDecision.UNAVAILABLE,
                null,
                null,
                null);
    }
}
