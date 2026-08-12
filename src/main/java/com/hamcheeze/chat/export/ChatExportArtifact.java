package com.hamcheeze.chat.export;

import java.nio.file.Path;
import java.time.Instant;

public record ChatExportArtifact(
        ChatExportTempWorkspace workspace,
        Path path,
        long sizeBytes,
        String sha256,
        long eventCount,
        long createdCount,
        long updatedCount,
        long deletedCount,
        long participantCount,
        Instant generatedAt
) {
}
