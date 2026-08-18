package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskLimits;

import java.math.BigDecimal;

public record NumberConstraint(
        BigDecimal minimumValue,
        BigDecimal maximumValue,
        boolean decimalAllowed
) implements TaskQuestionConstraint {

    public NumberConstraint {
        validateBound(minimumValue, "constraint.minimumValue");
        validateBound(maximumValue, "constraint.maximumValue");
        if (minimumValue != null && maximumValue != null
                && minimumValue.compareTo(maximumValue) > 0) {
            throw TaskDomainException.invariant(
                    "TASK_NUMBER_RANGE_INVALID",
                    "constraint",
                    "minimumValue must not exceed maximumValue");
        }
        if (!decimalAllowed) {
            requireInteger(minimumValue, "constraint.minimumValue");
            requireInteger(maximumValue, "constraint.maximumValue");
        }
    }

    @Override
    public TaskQuestionType questionType() {
        return TaskQuestionType.NUMBER;
    }

    static void validateBound(BigDecimal value, String path) {
        if (value == null) {
            return;
        }
        BigDecimal normalized = value.stripTrailingZeros();
        if (normalized.precision() > TaskLimits.MAX_NUMBER_PRECISION
                || Math.max(normalized.scale(), 0)
                > TaskLimits.MAX_NUMBER_SCALE) {
            throw TaskDomainException.invariant(
                    "TASK_NUMBER_FORMAT_INVALID",
                    path,
                    "number exceeds supported precision or scale");
        }
    }

    static void requireInteger(BigDecimal value, String path) {
        if (value != null && value.stripTrailingZeros().scale() > 0) {
            throw TaskDomainException.invariant(
                    "TASK_NUMBER_INTEGER_REQUIRED",
                    path,
                    "decimal value is not allowed");
        }
    }
}
