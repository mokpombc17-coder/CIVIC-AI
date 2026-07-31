package com.hamcheeze.chat.message;

import java.util.Objects;

public record EditChatMessageMutation(
        String actorUserId,
        String clientMutationId,
        String roomId,
        String messageId,
        String content
) {
    public EditChatMessageMutation {
        Objects.requireNonNull(actorUserId, "actorUserId");
        Objects.requireNonNull(clientMutationId, "clientMutationId");
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(messageId, "messageId");
        Objects.requireNonNull(content, "content");
    }
}
