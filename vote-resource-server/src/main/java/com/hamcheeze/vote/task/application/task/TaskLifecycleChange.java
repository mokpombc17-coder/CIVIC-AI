package com.hamcheeze.vote.task.application.task;

import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;

import java.util.Objects;

public record TaskLifecycleChange(
        Task task,
        TaskLifecycleHistory history
) {
    public TaskLifecycleChange {
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(history, "history");
        if (!task.id().equals(history.taskId())) {
            throw new IllegalArgumentException(
                    "task and lifecycle history must have the same taskId");
        }
    }
}
