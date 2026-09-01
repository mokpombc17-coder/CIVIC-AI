package com.hamcheeze.chat.export;

import com.hamcheeze.chat.room.MembershipStatus;

public record ResearchChatExportParticipantSnapshot(
        String userId,
        MembershipStatus status
) {
}
