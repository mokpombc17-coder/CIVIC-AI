package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.answer.TaskAnswerValue;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;

import java.util.Objects;

public record UserAnsweredTaskQuestion(
        TaskQuestionId questionId,
        TaskAnswerValue answerValue
) implements TaskSubmissionAnswerCommand {
    public UserAnsweredTaskQuestion {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(answerValue, "answerValue");
    }
}
