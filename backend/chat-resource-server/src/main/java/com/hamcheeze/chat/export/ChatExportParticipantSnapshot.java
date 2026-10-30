package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;

import java.time.Instant;

public record ChatExportParticipantSnapshot(
        int recordVersion,
        String membershipId,
        String userId,
        Long participantNumber,
        String displayName,
        MembershipRole role,
        MembershipStatus status,
        Instant joinedAt,
        Instant leftAt,
        Instant bannedAt,
        Long membershipVersion,
        Long profileVersion,
        boolean profileAvailable,
        Instant snapshotCapturedAt
) {

    public static ChatExportParticipantSnapshot synthetic(
            String membershipId,
            String userId,
            Instant capturedAt
    ) {
        return new ChatExportParticipantSnapshot(
                1,
                membershipId,
                userId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                false,
                capturedAt);
    }
}
