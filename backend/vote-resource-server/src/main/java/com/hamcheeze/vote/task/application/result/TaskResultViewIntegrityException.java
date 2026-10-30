package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.Objects;

public class TaskResultViewIntegrityException extends IllegalStateException {

    private final TaskId taskId;

    public TaskResultViewIntegrityException(TaskId taskId, String reason) {
        this(taskId, reason, null);
    }

    public TaskResultViewIntegrityException(
            TaskId taskId,
            String reason,
            Throwable cause
    ) {
        super("task result view integrity check failed for "
                + Objects.requireNonNull(taskId, "taskId")
                + ": " + Objects.requireNonNull(reason, "reason"), cause);
        this.taskId = taskId;
    }

    public TaskId taskId() {
        return taskId;
    }
}
