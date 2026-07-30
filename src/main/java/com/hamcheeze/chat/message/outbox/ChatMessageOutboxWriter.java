package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.message.ChatMessage;

public interface ChatMessageOutboxWriter {

    void appendMessageCreated(ChatMessage message);
}
