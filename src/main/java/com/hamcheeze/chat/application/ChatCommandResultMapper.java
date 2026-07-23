package com.hamcheeze.chat.application;

import org.springframework.stereotype.Component;

@Component
public final class ChatCommandResultMapper {

    public ChatCommandResultEnvelope toEnvelope(ChatCommandResult result) {
        return switch (result) {
            case ChatCommandRejected rejected -> new ChatCommandResultEnvelope(
                    rejected.clientMessageId(),
                    "REJECTED",
                    rejected.code().name(),
                    rejected.retryable(),
                    rejected.retryAfterMs(),
                    null,
                    null);
            case ChatCommandFailed failed -> new ChatCommandResultEnvelope(
                    failed.clientMessageId(),
                    "FAILED",
                    failed.code().name(),
                    failed.retryable(),
                    failed.retryAfterMs(),
                    null,
                    null);
            case ChatCommandOutcome outcome -> new ChatCommandResultEnvelope(
                    outcome.clientMessageId(),
                    outcome.code().name(),
                    null,
                    false,
                    null,
                    outcome.messageId(),
                    outcome.roomSequence());
        };
    }
}
