package com.hamcheeze.chat.export;

import java.time.Instant;

public record ResearchChatExportSnapshot(
        ChatExportRoomSnapshot room,
        long capturedChangeSequence,
        Instant capturedAt
) {
}
