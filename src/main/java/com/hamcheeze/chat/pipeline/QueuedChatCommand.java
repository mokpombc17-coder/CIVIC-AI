package com.hamcheeze.chat.pipeline;

import java.time.Instant;
import java.util.Objects;

public record QueuedChatCommand(
        AdmittedMessageCommand command,
        Instant acceptedAt
) {

    public QueuedChatCommand {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(acceptedAt, "acceptedAt");
    }
}
