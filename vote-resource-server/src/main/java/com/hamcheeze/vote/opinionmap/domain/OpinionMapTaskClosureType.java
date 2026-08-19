package com.hamcheeze.vote.opinionmap.domain;

import java.util.Objects;

public enum OpinionMapTaskClosureType {
    DEADLINE_REACHED,
    EARLY_CLOSED;

    public static OpinionMapTaskClosureType fromContract(String value) {
        Objects.requireNonNull(value, "value");
        if (value.isBlank() || !value.equals(value.strip())) {
            throw new IllegalArgumentException(
                    "closureType must be non-blank and trimmed");
        }
        try {
            return valueOf(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "closureType is not eligible for OpinionMap finalization: "
                            + value,
                    exception);
        }
    }
}
