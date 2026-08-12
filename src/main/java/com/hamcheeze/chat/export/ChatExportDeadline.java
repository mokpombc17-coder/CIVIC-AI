package com.hamcheeze.chat.export;

import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

public final class ChatExportDeadline {

    private final Clock clock;
    private final Instant deadline;

    public ChatExportDeadline(Clock clock, Duration duration) {
        this.clock = Objects.requireNonNull(clock, "clock");
        this.deadline = clock.instant().plus(
                Objects.requireNonNull(duration, "duration"));
    }

    public void check() {
        if (clock.instant().isAfter(deadline)) {
            throw new ChatExportException(
                    ChatExportErrorCode.CHAT_EXPORT_TOO_LARGE,
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    false,
                    "Export generation deadline exceeded");
        }
    }
}
