package com.hamcheeze.chat.message;

import java.util.Objects;

public record IdempotencyKey(
        String roomId,
        String senderUserId,
        String clientMessageId
) {

    public IdempotencyKey {
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(senderUserId, "senderUserId");
        Objects.requireNonNull(clientMessageId, "clientMessageId");
    }
}
