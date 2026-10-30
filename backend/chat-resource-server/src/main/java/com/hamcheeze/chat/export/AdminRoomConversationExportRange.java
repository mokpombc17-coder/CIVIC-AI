package com.hamcheeze.chat.export;

import org.springframework.http.HttpStatus;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

public record AdminRoomConversationExportRange(
        Instant fromInclusive,
        Instant toExclusive
) {

    public AdminRoomConversationExportRange {
        Objects.requireNonNull(fromInclusive, "fromInclusive");
        Objects.requireNonNull(toExclusive, "toExclusive");
        if (!fromInclusive.isBefore(toExclusive)) {
            throw invalid("fromInclusive must be before toExclusive");
        }
    }

    public static AdminRoomConversationExportRange validated(
            Instant fromInclusive,
            Instant toExclusive,
            Instant serverNow,
            Duration maxRange
    ) {
        Objects.requireNonNull(serverNow, "serverNow");
        Objects.requireNonNull(maxRange, "maxRange");
        AdminRoomConversationExportRange range =
                new AdminRoomConversationExportRange(
                        fromInclusive,
                        toExclusive);
        if (toExclusive.isAfter(serverNow)) {
            throw invalid("toExclusive must not be in the future");
        }
        if (Duration.between(fromInclusive, toExclusive)
                .compareTo(maxRange) > 0) {
            throw invalid("Export time range exceeds the configured limit");
        }
        return range;
    }

    private static ChatExportException invalid(String detail) {
        return new ChatExportException(
                ChatExportErrorCode.INVALID_EXPORT_TIME_RANGE,
                HttpStatus.BAD_REQUEST,
                false,
                detail);
    }
}
