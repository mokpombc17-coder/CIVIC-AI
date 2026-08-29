package com.hamcheeze.chat.export;

import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.util.Objects;

public final class AdminRoomConversationExportService {

    private final ChatExportProperties properties;
    private final Clock clock;

    public AdminRoomConversationExportService(
            ChatExportProperties properties,
            Clock clock
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public AdminRoomConversationExportExecution prepare(
            String adminId,
            String roomId,
            AdminRoomConversationExportRequest request
    ) {
        requireNonBlank(adminId, "adminId");
        requireNonBlank(roomId, "roomId");
        Objects.requireNonNull(request, "request");
        request.validatedRange(
                clock.instant(),
                properties.getMaxConversationExportRange());
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
