package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskText;

public record ScaleConstraint(
        int minimumValue,
        int maximumValue,
        String minimumLabel,
        String maximumLabel
) implements TaskQuestionConstraint {

    public ScaleConstraint {
        if (minimumValue != 0 && minimumValue != 1) {
            throw TaskDomainException.invariant(
                    "TASK_SCALE_MINIMUM_INVALID",
                    "constraint.minimumValue",
                    "scale minimumValue must be 0 or 1");
        }
        if (maximumValue < 2
                || maximumValue > TaskLimits.MAX_SCALE_VALUE
                || maximumValue <= minimumValue) {
            throw TaskDomainException.invariant(
                    "TASK_SCALE_MAXIMUM_INVALID",
                    "constraint.maximumValue",
                    "scale maximumValue must be between 2 and "
                            + TaskLimits.MAX_SCALE_VALUE);
        }
        minimumLabel = TaskText.optional(
                minimumLabel,
                TaskLimits.MAX_SCALE_LABEL_LENGTH,
                "TASK_SCALE_MINIMUM_LABEL",
                "constraint.minimumLabel");
        maximumLabel = TaskText.optional(
                maximumLabel,
                TaskLimits.MAX_SCALE_LABEL_LENGTH,
                "TASK_SCALE_MAXIMUM_LABEL",
                "constraint.maximumLabel");
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.SCALE;
    }
}
