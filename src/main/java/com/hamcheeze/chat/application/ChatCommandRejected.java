package com.hamcheeze.chat.application;

public record ChatCommandRejected(
        String clientMessageId,
        ChatCommandRejectedCode code,
        boolean retryable,
        Long retryAfterMs
) implements ChatCommandResult {
}
