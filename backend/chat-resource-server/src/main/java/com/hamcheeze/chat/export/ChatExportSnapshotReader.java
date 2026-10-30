package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.Optional;

public interface ChatExportSnapshotReader {

    Optional<ChatExportSnapshot> findStable(
            String roomId,
            Instant capturedAt,
            int maxAttempts);
}
