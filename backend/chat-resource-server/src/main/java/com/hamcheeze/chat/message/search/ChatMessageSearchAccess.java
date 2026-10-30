package com.hamcheeze.chat.message.search;

import java.util.Objects;

public record ChatMessageSearchAccess(
        ChatMessageSearchAccessState state,
        String membershipId,
        Long membershipVersion,
        Long messageVisibleAfterSequence
) {

    public ChatMessageSearchAccess {
        Objects.requireNonNull(state, "state");
        if (state == ChatMessageSearchAccessState.ALLOWED) {
            if (membershipId == null || membershipId.isBlank()
                    || membershipVersion == null
                    || membershipVersion < 0
                    || messageVisibleAfterSequence == null
                    || messageVisibleAfterSequence < 0) {
                throw new IllegalArgumentException(
                        "Allowed search access requires Membership context");
            }
        } else if (membershipId != null
                || membershipVersion != null
                || messageVisibleAfterSequence != null) {
            throw new IllegalArgumentException(
                    "Rejected search access must not expose context");
        }
    }

    public static ChatMessageSearchAccess allowed(
            String membershipId,
            long membershipVersion,
            long messageVisibleAfterSequence
    ) {
        return new ChatMessageSearchAccess(
                ChatMessageSearchAccessState.ALLOWED,
                membershipId,
                membershipVersion,
                messageVisibleAfterSequence);
    }

    public static ChatMessageSearchAccess accessDenied() {
        return rejected(ChatMessageSearchAccessState.ACCESS_DENIED);
    }

    public static ChatMessageSearchAccess roomNotAvailable() {
        return rejected(
                ChatMessageSearchAccessState.ROOM_NOT_AVAILABLE);
    }

    public static ChatMessageSearchAccess unavailable() {
        return rejected(ChatMessageSearchAccessState.UNAVAILABLE);
    }

    private static ChatMessageSearchAccess rejected(
            ChatMessageSearchAccessState state
    ) {
        return new ChatMessageSearchAccess(
                state,
                null,
                null,
                null);
    }
}
