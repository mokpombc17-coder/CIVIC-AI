package com.hamcheeze.chat.room;

public final class RoomParticipationIds {

    private static final String LEGACY_PREFIX = "legacy_";
    private static final String NORMAL_PREFIX = "participation_";

    private RoomParticipationIds() {
    }

    public static String legacy(String membershipId) {
        return LEGACY_PREFIX + requireText(membershipId);
    }

    public static String normal(String candidateMembershipId) {
        return NORMAL_PREFIX + requireText(candidateMembershipId);
    }

    private static String requireText(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    "senderMembershipId or membershipId must not be blank");
        }
        return value;
    }
}
