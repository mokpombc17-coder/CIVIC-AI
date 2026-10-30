package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;

import java.util.Objects;
import java.util.Optional;

public record OptionSelection(
        SurveyOptionId optionId,
        String inputText
) {

    public OptionSelection {
        Objects.requireNonNull(optionId, "optionId");
    }

    public Optional<String> optionalInputText() {
        return Optional.ofNullable(inputText);
    }

    OptionSelection normalized(String normalizedInputText) {
        return new OptionSelection(optionId, normalizedInputText);
    }
}
