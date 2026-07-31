package com.hamcheeze.chat.application;

public sealed interface ChatCommandResult
        permits ChatCommandRejected,
        ChatCommandFailed,
        ChatCommandOutcome,
        ChatMessageMutationCommandResult {

    default String clientMessageId() {
        return null;
    }
}
