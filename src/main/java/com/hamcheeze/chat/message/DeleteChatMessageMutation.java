package com.hamcheeze.chat.message;

import java.util.Objects;

public record DeleteChatMessageMutation(
        String actorUserId,
        String clientMutationId,
        String roomId,
        String messageId
) {
    public DeleteChatMessageMutation {
        Objects.requireNonNull(actorUserId, "actorUserId");
        Objects.requireNonNull(clientMutationId, "clientMutationId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(messageId, "messageId");
    }
}
