package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;

public record MultipleChoiceConstraint(
        int minimumSelections,
        int maximumSelections
) implements TaskQuestionConstraint {

    public MultipleChoiceConstraint {
        if (minimumSelections < 1) {
            throw TaskDomainException.invariant(
                    "TASK_MULTIPLE_MINIMUM_INVALID",
                    "constraint.minimumSelections",
                    "minimumSelections must be positive");
        }
        if (maximumSelections < minimumSelections) {
            throw TaskDomainException.invariant(
                    "TASK_MULTIPLE_MAXIMUM_INVALID",
                    "constraint.maximumSelections",
                    "maximumSelections must not be less than minimumSelections");
        }
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.MULTIPLE_CHOICE;
    }
}
