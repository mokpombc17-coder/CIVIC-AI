package com.hamcheeze.chat.pipeline;

public record AdmittedChatCommand(
        String userId,
        String senderMembershipId,
        String connectionId,
        String roomId,
        String clientMessageId,
        String content
) implements AdmittedMessageCommand {

    public AdmittedChatCommand {
        if (senderMembershipId == null
                || senderMembershipId.isBlank()) {
            throw new IllegalArgumentException(
                    "senderMembershipId must not be blank");
        }
    }

    @Override
    public String requestId() {
        return clientMessageId;
    }
}
