package com.hamcheeze.chat.message;

public enum MessageMutationOutcome {
    UPDATED,
    UNCHANGED,
    DELETED,
    ALREADY_DELETED,
    MESSAGE_NOT_FOUND,
    MESSAGE_MUTATION_FORBIDDEN,
    MESSAGE_DELETED,
    IDEMPOTENCY_CONFLICT
}
