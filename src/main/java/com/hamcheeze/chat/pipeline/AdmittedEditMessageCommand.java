package com.hamcheeze.chat.pipeline;

public record AdmittedEditMessageCommand(
        String userId,
        String connectionId,
        String roomId,
        String clientMutationId,
        String messageId,
        String content
) implements AdmittedMessageCommand {

    @Override
    public String requestId() {
        return clientMutationId;
    }
}
