package com.hamcheeze.chat.message.search;

import java.time.Instant;
import java.util.Objects;

public record ChatMessageSearchCursor(
        int cursorVersion,
        String roomId,
        String requesterMembershipId,
        long requesterMembershipVersion,
        long messageVisibleAfterSequence,
        String normalizedQueryFingerprint,
        int resultLimit,
        long searchUpperBoundSequence,
        long nextBeforeSequence,
        Instant issuedAt,
        Instant expiresAt
) {

    public static final int CURRENT_VERSION = 1;

    public ChatMessageSearchCursor {
        ChatMessageSearchCursorBinding binding =
                new ChatMessageSearchCursorBinding(
                        roomId,
                        requesterMembershipId,
                        requesterMembershipVersion,
                        messageVisibleAfterSequence,
                        normalizedQueryFingerprint,
                        resultLimit);
        if (cursorVersion != CURRENT_VERSION) {
            throw new IllegalArgumentException(
                    "Unsupported message search cursor version");
        }
        if (searchUpperBoundSequence < 0
                || searchUpperBoundSequence
                < binding.messageVisibleAfterSequence()) {
            throw new IllegalArgumentException(
                    "searchUpperBoundSequence is out of range");
        }
        if (nextBeforeSequence
                <= binding.messageVisibleAfterSequence()
                || nextBeforeSequence > searchUpperBoundSequence) {
            throw new IllegalArgumentException(
                    "nextBeforeSequence is out of range");
        }
        Objects.requireNonNull(issuedAt, "issuedAt");
        Objects.requireNonNull(expiresAt, "expiresAt");
        if (!expiresAt.isAfter(issuedAt)) {
            throw new IllegalArgumentException(
                    "expiresAt must be after issuedAt");
        }
    }

    public ChatMessageSearchCursorBinding binding() {
        return new ChatMessageSearchCursorBinding(
                roomId,
                requesterMembershipId,
                requesterMembershipVersion,
                messageVisibleAfterSequence,
                normalizedQueryFingerprint,
                resultLimit);
    }
}
