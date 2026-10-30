package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

import java.util.List;
import java.util.Objects;

public record MultipleChoiceAnswer(
        SurveyQuestionId questionId,
        List<OptionSelection> selections
) implements SurveyAnswer {

    public MultipleChoiceAnswer {
        Objects.requireNonNull(questionId, "questionId");
        selections = List.copyOf(
                Objects.requireNonNull(selections, "selections"));
        if (selections.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "selections must not contain null");
        }
    }

    @Override
    public SurveyAnswerType answerType() {
        return SurveyAnswerType.MULTIPLE_CHOICE;
    }
}
