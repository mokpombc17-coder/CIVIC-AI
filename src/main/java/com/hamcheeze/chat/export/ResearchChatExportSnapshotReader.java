package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.Optional;

public interface ResearchChatExportSnapshotReader {

    Optional<ResearchChatExportSnapshot> findStable(
            String roomId,
            Instant capturedAt,
            int maxAttempts);
}
