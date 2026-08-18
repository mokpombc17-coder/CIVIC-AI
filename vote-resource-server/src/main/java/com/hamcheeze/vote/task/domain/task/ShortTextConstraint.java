package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;

public record ShortTextConstraint(int maxLength)
        implements TaskQuestionConstraint {

    public ShortTextConstraint {
        if (maxLength < 1 || maxLength > TaskLimits.MAX_SHORT_TEXT_LENGTH) {
            throw TaskDomainException.invariant(
                    "TASK_SHORT_TEXT_MAX_LENGTH_INVALID",
                    "constraint.maxLength",
                    "short text maxLength must be between 1 and "
                            + TaskLimits.MAX_SHORT_TEXT_LENGTH);
        }
    }

    public static ShortTextConstraint defaults() {
        return new ShortTextConstraint(TaskLimits.MAX_SHORT_TEXT_LENGTH);
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.SHORT_TEXT;
    }
}
