package com.hamcheeze.chat.application;

public sealed interface ChatCommandResult
        permits ChatCommandRejected, ChatCommandFailed, ChatCommandOutcome {

    String clientMessageId();
}
