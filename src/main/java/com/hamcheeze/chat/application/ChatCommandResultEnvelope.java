package com.hamcheeze.chat.application;

public record ChatCommandResultEnvelope(
        String clientMessageId,
        String status,
        String code,
        boolean retryable,
        Long retryAfterMs,
        String messageId,
        Long roomSequence,
        String commandType,
        String clientMutationId,
        Long messageVersion,
        String messageState,
        Boolean replayed
) {
    public ChatCommandResultEnvelope(
            String clientMessageId,
            String status,
            String code,
            boolean retryable,
            Long retryAfterMs,
            String messageId,
            Long roomSequence
    ) {
        this(
                clientMessageId,
                status,
                code,
                retryable,
                retryAfterMs,
                messageId,
                roomSequence,
                null,
                null,
                null,
                null,
                null);
    }
}
