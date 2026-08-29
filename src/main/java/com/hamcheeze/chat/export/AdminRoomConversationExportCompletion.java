package com.hamcheeze.chat.export;

import java.time.Instant;

public record AdminRoomConversationExportCompletion(
        Instant completedAt,
        Instant deliveryCompletedAt,
        long messageCount,
        long changeCount,
        long createdCount,
        long updatedCount,
        long deletedCount,
        long artifactSizeBytes,
        String artifactSha256
) {
}
