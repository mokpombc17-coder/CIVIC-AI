package com.hamcheeze.chat.export;

import java.time.Instant;
import java.util.Optional;

public interface AdminRoomConversationExportSnapshotReader {

    Optional<AdminRoomConversationExportSnapshot> findStable(
            String roomId,
            AdminRoomConversationExportRange range,
            Instant capturedAt,
            int maxAttempts);
}
