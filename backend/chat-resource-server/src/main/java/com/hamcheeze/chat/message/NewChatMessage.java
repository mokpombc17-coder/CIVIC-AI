package com.hamcheeze.chat.message;

import com.hamcheeze.chat.pipeline.AdmittedChatCommand;

import java.util.Objects;

public record NewChatMessage(
        String roomId,
        String senderUserId,
        String senderMembershipId,
        String senderParticipationId,
        String clientMessageId,
        String content
) {

    public NewChatMessage {
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(senderUserId, "senderUserId");
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
        Objects.requireNonNull(clientMessageId, "clientMessageId");
        Objects.requireNonNull(content, "content");
    }

    public NewChatMessage(
            String roomId,
            String senderUserId,
            String senderMembershipId,
            String clientMessageId,
            String content
    ) {
        this(
                roomId,
                senderUserId,
                senderMembershipId,
                com.hamcheeze.chat.room.RoomParticipationIds.legacy(
                        senderMembershipId),
                clientMessageId,
                content);
    }

    public static NewChatMessage from(AdmittedChatCommand command) {
        Objects.requireNonNull(command, "command");
        return new NewChatMessage(
                command.roomId(),
                command.userId(),
                command.senderMembershipId(),
                command.senderParticipationId(),
                command.clientMessageId(),
                command.content());
    }

    public IdempotencyKey idempotencyKey() {
        return new IdempotencyKey(
                roomId,
                senderUserId,
                clientMessageId);
    }
}
