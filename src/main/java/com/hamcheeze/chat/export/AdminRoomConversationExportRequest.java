package com.hamcheeze.chat.export;

import jakarta.validation.constraints.NotNull;

import java.time.Duration;
import java.time.Instant;

public record AdminRoomConversationExportRequest(
        @NotNull Instant fromInclusive,
        @NotNull Instant toExclusive
) {

    AdminRoomConversationExportRange validatedRange(
            Instant serverNow,
            Duration maxRange
    ) {
        return AdminRoomConversationExportRange.validated(
                fromInclusive,
                toExclusive,
                serverNow,
                maxRange);
    }
}
