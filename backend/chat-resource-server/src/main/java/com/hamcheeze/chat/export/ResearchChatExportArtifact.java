package com.hamcheeze.chat.export;

import java.nio.file.Path;
import java.time.Instant;

public record ResearchChatExportArtifact(
        ResearchChatExportTempWorkspace workspace,
        Path path,
        long sizeBytes,
        String sha256,
        long messageCount,
        long changeCount,
        long createdCount,
        long updatedCount,
        long deletedCount,
        Instant generatedAt
) {
}
