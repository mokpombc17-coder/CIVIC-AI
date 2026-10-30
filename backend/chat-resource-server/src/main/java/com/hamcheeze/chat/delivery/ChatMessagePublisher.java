package com.hamcheeze.chat.delivery;

public interface ChatMessagePublisher {

    void publish(ChatMessageEventEnvelope event);
}
