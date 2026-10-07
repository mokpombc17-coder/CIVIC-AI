package com.hamcheeze.chat.pipeline;

public record AdmittedChatCommand(
        String userId,
        String senderMembershipId,
        String senderParticipationId,
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
        if (senderParticipationId == null
                || senderParticipationId.isBlank()) {
            throw new IllegalArgumentException(
                    "senderParticipationId must not be blank");
        }
    }

    public AdmittedChatCommand(
            String userId,
            String senderMembershipId,
            String connectionId,
            String roomId,
            String clientMessageId,
            String content
    ) {
        this(
                userId,
                senderMembershipId,
                com.hamcheeze.chat.room.RoomParticipationIds.legacy(
                        senderMembershipId),
                connectionId,
                roomId,
                clientMessageId,
                content);
    }

    @Override
    public String requestId() {
        return clientMessageId;
    }
}
