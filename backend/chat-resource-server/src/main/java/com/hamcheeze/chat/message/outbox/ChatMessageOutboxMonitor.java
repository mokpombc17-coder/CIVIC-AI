package com.hamcheeze.chat.message.outbox;

public interface ChatMessageOutboxMonitor {

    ChatMessageOutboxBacklogSnapshot sample();
}
