package com.hamcheeze.vote.survey.domain.common;

import java.util.Objects;
import java.util.UUID;

public record ConsentReceiptId(UUID value) implements SurveyId {

    public ConsentReceiptId {
        Objects.requireNonNull(value, "value");
    }
}
