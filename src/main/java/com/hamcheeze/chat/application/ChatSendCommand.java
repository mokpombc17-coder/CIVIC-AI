package com.hamcheeze.chat.application;

public record ChatSendCommand(
        String clientMessageId,
        String content
) {
}
