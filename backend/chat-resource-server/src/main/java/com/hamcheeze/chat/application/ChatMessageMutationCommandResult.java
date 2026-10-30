package com.hamcheeze.chat.application;

import com.hamcheeze.chat.message.MessageMutationCommandType;
import com.hamcheeze.chat.message.MessageState;

import java.util.Objects;

public record ChatMessageMutationCommandResult(
        MessageMutationCommandType commandType,
        String clientMutationId,
        String status,
        String code,
        boolean retryable,
        Long retryAfterMs,
        String messageId,
        Long roomSequence,
        Long messageVersion,
        MessageState messageState,
        boolean replayed
) implements ChatCommandResult {

    public ChatMessageMutationCommandResult {
        Objects.requireNonNull(commandType, "commandType");
        Objects.requireNonNull(status, "status");
    }
}
