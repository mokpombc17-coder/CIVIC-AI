package com.hamcheeze.chat.application;

public record ChatCommandOutcome(
        String clientMessageId,
        ChatCommandOutcomeCode code,
        String messageId,
        Long roomSequence
) implements ChatCommandResult {

    public ChatCommandOutcome {
        if (messageId == null || roomSequence == null) {
            throw new IllegalArgumentException(
                    "Final outcomes require messageId and roomSequence");
        }
    }
}
