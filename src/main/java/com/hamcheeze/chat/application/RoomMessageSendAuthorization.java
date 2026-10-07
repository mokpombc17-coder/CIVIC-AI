package com.hamcheeze.chat.application;

import java.util.Objects;

public record RoomMessageSendAuthorization(
        RoomAuthorizationDecision decision,
        String membershipId,
        String participationId,
        Long membershipVersion,
        Long messageVisibleAfterSequence
) {

    public RoomMessageSendAuthorization {
        Objects.requireNonNull(decision, "decision");
        if (decision == RoomAuthorizationDecision.ALLOWED) {
            requireText(membershipId, "membershipId");
            requireText(participationId, "participationId");
            requireNonNegative(membershipVersion, "membershipVersion");
            requireNonNegative(
                    messageVisibleAfterSequence,
                    "messageVisibleAfterSequence");
        } else if (membershipId != null
                || participationId != null
                || membershipVersion != null
                || messageVisibleAfterSequence != null) {
            throw new IllegalArgumentException(
                    "Rejected authorization must not expose membership context");
        }
    }

    public static RoomMessageSendAuthorization allowed(
            String membershipId,
            String participationId,
            long membershipVersion,
            long messageVisibleAfterSequence
    ) {
        return new RoomMessageSendAuthorization(
                RoomAuthorizationDecision.ALLOWED,
                membershipId,
                participationId,
                membershipVersion,
                messageVisibleAfterSequence);
    }

    public static RoomMessageSendAuthorization allowed(
            String membershipId,
            long membershipVersion,
            long messageVisibleAfterSequence
    ) {
        return allowed(
                membershipId,
                com.hamcheeze.chat.room.RoomParticipationIds.legacy(
                        membershipId),
                membershipVersion,
                messageVisibleAfterSequence);
    }

    public static RoomMessageSendAuthorization rejected(
            RoomAuthorizationDecision decision
    ) {
        if (decision == RoomAuthorizationDecision.ALLOWED) {
            throw new IllegalArgumentException(
                    "ALLOWED authorization requires membership context");
        }
        return new RoomMessageSendAuthorization(
                decision,
                null,
                null,
                null,
                null);
    }

    private static void requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
    }

    private static void requireNonNegative(
            Long value,
            String fieldName
    ) {
        if (value == null || value < 0) {
            throw new IllegalArgumentException(
                    fieldName + " must not be negative");
        }
    }
}
