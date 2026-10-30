package com.hamcheeze.chat.pipeline;

public record AdmittedDeleteMessageCommand(
        String userId,
        String connectionId,
        String roomId,
        String clientMutationId,
        String messageId
) implements AdmittedMessageCommand {

    @Override
    public String requestId() {
        return clientMutationId;
    }
}
