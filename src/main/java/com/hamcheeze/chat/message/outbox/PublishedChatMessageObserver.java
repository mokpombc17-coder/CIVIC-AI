package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;

@FunctionalInterface
public interface PublishedChatMessageObserver {

    PublishedChatMessageObserver NOOP = (claimed, envelope) -> {
    };

    void onPublished(
            ClaimedChatMessageOutboxEvent claimed,
            ChatMessageEventEnvelope envelope);
}
