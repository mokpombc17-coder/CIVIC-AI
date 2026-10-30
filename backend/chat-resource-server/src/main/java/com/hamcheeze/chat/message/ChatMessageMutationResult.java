package com.hamcheeze.chat.message;

import java.util.Objects;

public record ChatMessageMutationResult(
        MessageMutationCommandType commandType,
        String clientMutationId,
        MessageMutationOutcome outcome,
        String messageId,
        Long roomSequence,
        Long messageVersion,
        MessageState messageState,
        boolean replayed
) {
    public ChatMessageMutationResult {
        Objects.requireNonNull(commandType, "commandType");
        Objects.requireNonNull(clientMutationId, "clientMutationId");
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(messageId, "messageId");
        if (outcome == MessageMutationOutcome.UPDATED
                || outcome == MessageMutationOutcome.UNCHANGED
                || outcome == MessageMutationOutcome.DELETED
                || outcome == MessageMutationOutcome.ALREADY_DELETED
                || outcome == MessageMutationOutcome.MESSAGE_DELETED) {
            Objects.requireNonNull(roomSequence, "roomSequence");
            Objects.requireNonNull(messageVersion, "messageVersion");
            Objects.requireNonNull(messageState, "messageState");
        }
    }

    public ChatMessageMutationResult asReplay() {
        return new ChatMessageMutationResult(
                commandType,
                clientMutationId,
                outcome,
                messageId,
                roomSequence,
                messageVersion,
                messageState,
                true);
    }
}
