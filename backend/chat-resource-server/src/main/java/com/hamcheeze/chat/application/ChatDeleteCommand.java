package com.hamcheeze.chat.application;

public record ChatDeleteCommand(
        String clientMutationId,
        String messageId
) {
}
