package com.hamcheeze.chat.export;

import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

public final class AdminRoomConversationExportService {

    private final ChatExportProperties properties;
    private final Clock clock;
    private final AdminRoomConversationExportSnapshotReader snapshotReader;

    public AdminRoomConversationExportService(
            ChatExportProperties properties,
            Clock clock,
            AdminRoomConversationExportSnapshotReader snapshotReader
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.snapshotReader = Objects.requireNonNull(
                snapshotReader,
                "snapshotReader");
    }

    public AdminRoomConversationExportExecution prepare(
            String adminId,
            String roomId,
            AdminRoomConversationExportRequest request
    ) {
        requireNonBlank(adminId, "adminId");
        requireNonBlank(roomId, "roomId");
        Objects.requireNonNull(request, "request");
        Instant capturedAt = clock.instant();
        AdminRoomConversationExportRange range = request.validatedRange(
                capturedAt,
                properties.getMaxConversationExportRange());
        try {
            snapshotReader.findStable(
                            roomId,
                            range,
                            capturedAt,
                            properties.getSnapshotMaxAttempts())
                    .orElseThrow(() -> new ChatExportException(
                            ChatExportErrorCode.ROOM_NOT_FOUND,
                            HttpStatus.NOT_FOUND,
                            false,
                            "Room was not found"));
        } catch (ChatExportSnapshotUnstableException exception) {
            throw new ChatExportException(
                    ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                    HttpStatus.SERVICE_UNAVAILABLE,
                    true,
                    "Admin room conversation snapshot is temporarily "
                            + "unavailable",
                    exception);
        }
        throw new ChatExportException(
                ChatExportErrorCode.CHAT_EXPORT_UNAVAILABLE,
                HttpStatus.SERVICE_UNAVAILABLE,
                true,
                "Admin room conversation export is not available yet");
    }

    private static void requireNonBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }
}
