package com.hamcheeze.chat.room;

import java.time.Instant;
import java.util.regex.Pattern;

final class RoomDomainValidation {

    private static final Pattern ROOM_ID_PATTERN =
            Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private RoomDomainValidation() {
    }

    static String requireRoomId(String roomId) {
        if (roomId == null || !ROOM_ID_PATTERN.matcher(roomId).matches()) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_ROOM_ID);
        }
        return roomId;
    }

    static String requireRoomName(String name) {
        if (name == null) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_ROOM_NAME);
        }
        String canonical = name.trim();
        if (canonical.isEmpty()
                || canonical.length() > Room.MAX_NAME_LENGTH) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_ROOM_NAME);
        }
        return canonical;
    }

    static String requireRoomDescription(String description) {
        if (description == null) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_ROOM_DESCRIPTION);
        }
        String canonical = description.strip();
        if (canonical.codePointCount(0, canonical.length())
                > Room.MAX_DESCRIPTION_CODE_POINTS) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_ROOM_DESCRIPTION);
        }
        for (int offset = 0; offset < canonical.length();) {
            int codePoint = canonical.codePointAt(offset);
            if (codePoint < 0x20
                    && codePoint != '\t'
                    && codePoint != '\n'
                    && codePoint != '\r') {
                throw new RoomDomainException(
                        RoomDomainErrorCode.INVALID_ROOM_DESCRIPTION);
            }
            offset += Character.charCount(codePoint);
        }
        return canonical;
    }

    static String requireMembershipId(String membershipId) {
        if (membershipId == null || membershipId.isBlank()) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_MEMBERSHIP_ID);
        }
        return membershipId;
    }

    static String requireUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_USER_ID);
        }
        return userId;
    }

    static <T> T requireStateValue(T value) {
        if (value == null) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        return value;
    }

    static Instant requireStateTime(Instant value) {
        if (value == null) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        return value;
    }

    static Instant requireTransitionTime(Instant value) {
        if (value == null) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_TRANSITION_TIME);
        }
        return value;
    }

    static void requireNotBefore(
            Instant value,
            Instant lowerBound
    ) {
        if (value.isBefore(lowerBound)) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_TRANSITION_TIME);
        }
    }

    static long requireVersion(long version) {
        if (version < 0) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_VERSION);
        }
        return version;
    }

    static long requireMessageVisibleAfterSequence(long sequence) {
        if (sequence < 0) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        return sequence;
    }

    static long nextVersion(long version) {
        if (version == Long.MAX_VALUE) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_VERSION);
        }
        return version + 1;
    }
}
