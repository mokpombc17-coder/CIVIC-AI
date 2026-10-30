package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.Membership;

import java.util.Objects;

public final class RoomReadPositionResolver {

    public RoomReadPosition resolve(
            Membership membership,
            RoomReadState state
    ) {
        Objects.requireNonNull(membership, "membership");
        verifyIdentity(membership, state);

        long visibilityBoundary =
                membership.messageVisibleAfterSequence();
        long storedCursor = state == null
                ? 0
                : state.lastReadSequence();
        return new RoomReadPosition(
                visibilityBoundary,
                storedCursor,
                Math.max(visibilityBoundary, storedCursor));
    }

    private static void verifyIdentity(
            Membership membership,
            RoomReadState state
    ) {
        if (state != null
                && (!state.membershipId().equals(
                        membership.membershipId())
                || !state.roomId().equals(membership.roomId())
                || !state.userId().equals(membership.userId()))) {
            throw new IllegalStateException(
                    "Room read state identity does not match membership");
        }
    }
}
