package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;

public record LongTextConstraint(int maxLength)
        implements TaskQuestionConstraint {

    public LongTextConstraint {
        if (maxLength < 1 || maxLength > TaskLimits.MAX_LONG_TEXT_LENGTH) {
            throw TaskDomainException.invariant(
                    "TASK_LONG_TEXT_MAX_LENGTH_INVALID",
                    "constraint.maxLength",
                    "long text maxLength must be between 1 and "
                            + TaskLimits.MAX_LONG_TEXT_LENGTH);
        }
    }

    public static LongTextConstraint defaults() {
        return new LongTextConstraint(TaskLimits.MAX_LONG_TEXT_LENGTH);
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.LONG_TEXT;
    }
}
