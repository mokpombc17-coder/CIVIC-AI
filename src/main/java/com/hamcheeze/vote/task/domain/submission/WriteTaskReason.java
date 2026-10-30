package com.hamcheeze.vote.task.domain.submission;

import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskText;

import java.util.Objects;

public record WriteTaskReason(
        TaskQuestionId questionId,
        TaskOptionId selectedOptionId,
        String reason
) implements TaskSubmissionAnswerCommand {
    public WriteTaskReason {
        Objects.requireNonNull(questionId, "questionId");
        Objects.requireNonNull(selectedOptionId, "selectedOptionId");
        reason = TaskText.required(
                reason,
                TaskLimits.MAX_REASON_LENGTH,
                "TASK_SUBMISSION_REASON",
                "reason");
    }
}
