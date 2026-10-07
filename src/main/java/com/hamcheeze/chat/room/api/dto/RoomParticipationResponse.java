package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.ParticipationEndReason;
import com.hamcheeze.chat.room.ParticipationOrigin;
import com.hamcheeze.chat.room.ParticipationStatus;
import com.hamcheeze.chat.room.RoomParticipation;

import java.time.Instant;

public record RoomParticipationResponse(
        String participationId,
        String membershipId,
        String userLabel,
        ParticipationOrigin origin,
        ParticipationStatus status,
        long enteredAfterMessageSequence,
        Long endedAfterMessageSequence,
        String displayName,
        String imageUrl,
        long profileVersion,
        Instant joinedAt,
        Instant endedAt,
        ParticipationEndReason endReason,
        long version
) {

    public static RoomParticipationResponse from(
            RoomParticipation participation
    ) {
        String userLabel = participation.userLabel() == null
                ? participation.profile().displayName()
                : participation.userLabel();
        return from(participation, userLabel);
    }

    public static RoomParticipationResponse from(
            RoomParticipation participation,
            String userLabel
    ) {
        return new RoomParticipationResponse(
                participation.participationId(),
                participation.membershipId(),
                requireText(userLabel, "userLabel"),
                participation.origin(),
                participation.status(),
                participation.enteredAfterMessageSequence(),
                participation.endedAfterMessageSequence(),
                participation.profile().displayName(),
                participation.profile().imageUrl(),
                participation.profile().version(),
                participation.joinedAt(),
                participation.endedAt(),
                participation.endReason(),
                participation.version());
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
        return value;
    }
}
