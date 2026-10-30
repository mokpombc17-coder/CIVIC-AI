package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;

import java.util.List;
import java.util.Objects;

public record MatrixSingleChoiceAnswer(
        SurveyQuestionId questionId,
        List<MatrixSingleChoiceItemAnswer> itemAnswers
) implements SurveyAnswer {

    public MatrixSingleChoiceAnswer {
        Objects.requireNonNull(questionId, "questionId");
        itemAnswers = List.copyOf(Objects.requireNonNull(
                itemAnswers, "itemAnswers"));
        if (itemAnswers.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "itemAnswers must not contain null");
        }
    }

    @Override
    public SurveyAnswerType answerType() {
        return SurveyAnswerType.MATRIX_SINGLE_CHOICE;
    }
}
