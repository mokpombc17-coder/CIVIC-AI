package com.hamcheeze.chat.export;

import java.time.Instant;

public record ChatExportCompletion(
        Instant completedAt,
        Instant deliveryCompletedAt,
        long eventCount,
        long createdCount,
        long updatedCount,
        long deletedCount,
        long artifactSizeBytes,
        String artifactSha256
) {
}
