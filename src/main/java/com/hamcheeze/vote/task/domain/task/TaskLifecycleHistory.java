package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskLimits;
import com.hamcheeze.vote.task.domain.common.TaskText;

import java.time.Instant;
import java.util.Objects;

public record TaskLifecycleHistory(
        TaskLifecycleHistoryId id,
        TaskId taskId,
        TaskLifecycleEventType eventType,
        TaskStatus previousStatus,
        TaskStatus newStatus,
        TaskSchedule previousSchedule,
        TaskSchedule newSchedule,
        TaskLifecycleTrigger trigger,
        TaskActorId actorId,
        String reason,
        TaskClosureType closureType,
        Instant occurredAt
) {
    public TaskLifecycleHistory {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(previousStatus, "previousStatus");
        Objects.requireNonNull(newStatus, "newStatus");
        Objects.requireNonNull(trigger, "trigger");
        Objects.requireNonNull(occurredAt, "occurredAt");
        reason = TaskText.optional(
                reason,
                TaskLimits.MAX_REASON_LENGTH,
                "TASK_LIFECYCLE_REASON",
                "reason");
        if (trigger == TaskLifecycleTrigger.ADMIN && actorId == null) {
            throw TaskDomainException.invariant(
                    "TASK_LIFECYCLE_ACTOR_REQUIRED",
                    "actorId",
                    "ADMIN lifecycle event requires actorId");
        }
        if (trigger == TaskLifecycleTrigger.SYSTEM && actorId != null) {
            throw TaskDomainException.invariant(
                    "TASK_LIFECYCLE_ACTOR_NOT_ALLOWED",
                    "actorId",
                    "SYSTEM lifecycle event must not have actorId");
        }
        if (newStatus == TaskStatus.CLOSED && closureType == null) {
            throw TaskDomainException.invariant(
                    "TASK_LIFECYCLE_CLOSURE_TYPE_REQUIRED",
                    "closureType",
                    "closed lifecycle event requires closureType");
        }
        if (newStatus != TaskStatus.CLOSED && closureType != null) {
            throw TaskDomainException.invariant(
                    "TASK_LIFECYCLE_CLOSURE_TYPE_NOT_ALLOWED",
                    "closureType",
                    "non-closed lifecycle event must not have closureType");
        }
    }
}
