package com.hamcheeze.chat.pipeline;

public sealed interface AdmittedMessageCommand
        permits AdmittedChatCommand,
        AdmittedEditMessageCommand,
        AdmittedDeleteMessageCommand {

    String userId();

    String connectionId();

    String roomId();

    String requestId();
}
