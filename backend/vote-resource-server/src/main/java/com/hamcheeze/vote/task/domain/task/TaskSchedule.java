package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;

import java.time.Instant;
import java.util.Objects;

public record TaskSchedule(
        Instant scheduledOpenAt,
        Instant scheduledCloseAt
) {
    public TaskSchedule {
        Objects.requireNonNull(scheduledOpenAt, "scheduledOpenAt");
        Objects.requireNonNull(scheduledCloseAt, "scheduledCloseAt");
        if (!scheduledOpenAt.isBefore(scheduledCloseAt)) {
            throw TaskDomainException.invariant(
                    "TASK_SCHEDULE_RANGE_INVALID",
                    "schedule",
                    "scheduledOpenAt must be before scheduledCloseAt");
        }
    }

    public boolean contains(Instant instant) {
        Objects.requireNonNull(instant, "instant");
        return !instant.isBefore(scheduledOpenAt)
                && instant.isBefore(scheduledCloseAt);
    }
}
