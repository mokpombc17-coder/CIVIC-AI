package com.hamcheeze.chat.pipeline;

public record AdmittedChatCommand(
        String userId,
        String connectionId,
        String roomId,
        String clientMessageId,
        String content
) implements AdmittedMessageCommand {

    @Override
    public String requestId() {
        return clientMessageId;
    }
}
