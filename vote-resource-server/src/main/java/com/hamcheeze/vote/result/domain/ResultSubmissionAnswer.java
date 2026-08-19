package com.hamcheeze.vote.result.domain;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record ResultSubmissionAnswer(
        UUID questionId,
        ResultAnswerType answerType,
        ResultAnswerSource source,
        UUID adoptedPredictionCandidateId,
        String textValue,
        BigDecimal numberValue,
        Integer scaleValue,
        List<ResultAnswerSelection> selections
) {

    public ResultSubmissionAnswer {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(answerType, "answerType");
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(selections, "selections");
        if (selections.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "selections must not contain null");
        }
        selections = selections.stream()
                .sorted(Comparator.comparing(
                        ResultAnswerSelection::optionId))
                .toList();
        if (new HashSet<>(selections.stream()
                .map(ResultAnswerSelection::optionId)
                .toList()).size() != selections.size()) {
            throw new IllegalArgumentException(
                    "selections must not contain duplicate optionId");
        }
        if (source == ResultAnswerSource.AI_ACCEPTED
                && adoptedPredictionCandidateId == null) {
            throw new IllegalArgumentException(
                    "AI_ACCEPTED answer requires candidate ID");
        }
        if (source == ResultAnswerSource.USER_ANSWERED
                && adoptedPredictionCandidateId != null) {
            throw new IllegalArgumentException(
                    "USER_ANSWERED answer must not have candidate ID");
        }
        numberValue = numberValue == null
                ? null : numberValue.stripTrailingZeros();
        validateValueShape(
                answerType, textValue, numberValue, scaleValue, selections);
    }

    private static void validateValueShape(
            ResultAnswerType answerType,
            String textValue,
            BigDecimal numberValue,
            Integer scaleValue,
            List<ResultAnswerSelection> selections
    ) {
        boolean text = textValue != null;
        boolean number = numberValue != null;
        boolean scale = scaleValue != null;
        boolean selected = !selections.isEmpty();
        boolean valid = switch (answerType) {
            case SINGLE_CHOICE -> selected
                    && selections.size() == 1
                    && !text && !number && !scale;
            case MULTIPLE_CHOICE -> selected
                    && !text && !number && !scale;
            case SHORT_TEXT, LONG_TEXT -> text
                    && !number && !scale && !selected;
            case NUMBER -> number
                    && !text && !scale && !selected;
            case SCALE -> scale
                    && !text && !number && !selected;
        };
        if (!valid) {
            throw new IllegalArgumentException(
                    "answer value does not match answerType");
        }
    }
}
