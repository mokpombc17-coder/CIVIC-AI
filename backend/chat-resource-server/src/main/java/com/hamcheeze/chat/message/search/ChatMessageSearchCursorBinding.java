package com.hamcheeze.chat.message.search;

import java.util.regex.Pattern;

public record ChatMessageSearchCursorBinding(
        String roomId,
        String requesterMembershipId,
        long requesterMembershipVersion,
        long messageVisibleAfterSequence,
        String normalizedQueryFingerprint,
        int resultLimit
) {

    private static final Pattern ROOM_ID =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    private static final Pattern SHA_256_HEX =
            Pattern.compile("^[0-9a-f]{64}$");

    public ChatMessageSearchCursorBinding {
        requireRoomId(roomId);
        requireMembershipId(requesterMembershipId);
        if (requesterMembershipVersion < 0) {
            throw new IllegalArgumentException(
                    "requesterMembershipVersion must not be negative");
        }
        if (messageVisibleAfterSequence < 0) {
            throw new IllegalArgumentException(
                    "messageVisibleAfterSequence must not be negative");
        }
        if (normalizedQueryFingerprint == null
                || !SHA_256_HEX.matcher(
                        normalizedQueryFingerprint).matches()) {
            throw new IllegalArgumentException(
                    "normalizedQueryFingerprint must be SHA-256 hex");
        }
        if (resultLimit < 1 || resultLimit > 50) {
            throw new IllegalArgumentException(
                    "resultLimit must be between 1 and 50");
        }
    }

    private static void requireRoomId(String roomId) {
        if (roomId == null || !ROOM_ID.matcher(roomId).matches()) {
            throw new IllegalArgumentException(
                    "roomId has an invalid format");
        }
    }

    private static void requireMembershipId(String membershipId) {
        if (membershipId == null || membershipId.isBlank()) {
            throw new IllegalArgumentException(
                    "requesterMembershipId must not be blank");
        }
    }
}
