package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.List;

public record ResearchChatExportSnapshot(
        ChatExportRoomSnapshot room,
        List<ResearchChatExportCategorySnapshot> categories,
        List<ResearchChatExportParticipantSnapshot> participants,
        long capturedChangeSequence,
        Instant capturedAt
) {

    public ResearchChatExportSnapshot {
        categories = List.copyOf(categories);
        participants = List.copyOf(participants);
    }
}
