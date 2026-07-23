package com.hamcheeze.chat.application;

public record ChatCommandResultEnvelope(
        String clientMessageId,
        String status,
        String code,
        boolean retryable,
        Long retryAfterMs,
        String messageId,
        Long roomSequence
) {
}
