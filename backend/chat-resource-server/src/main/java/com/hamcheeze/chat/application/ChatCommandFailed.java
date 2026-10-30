package com.hamcheeze.chat.application;

public record ChatCommandFailed(
        String clientMessageId,
        ChatCommandFailedCode code,
        boolean retryable,
        Long retryAfterMs
) implements ChatCommandResult {
}
