package com.hamcheeze.chat.application;

public record ChatEditCommand(
        String clientMutationId,
        String messageId,
        String content
) {
}
