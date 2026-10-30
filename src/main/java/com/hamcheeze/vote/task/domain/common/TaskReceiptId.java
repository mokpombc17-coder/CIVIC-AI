package com.hamcheeze.vote.task.domain.common;

import java.util.Objects;
import java.util.UUID;

public record TaskReceiptId(UUID value) {

    public TaskReceiptId {
        Objects.requireNonNull(value, "value");
    }
}
