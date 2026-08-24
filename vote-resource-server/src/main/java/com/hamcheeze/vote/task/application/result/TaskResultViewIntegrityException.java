package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.Objects;

public class TaskResultViewIntegrityException extends IllegalStateException {

    private final TaskId taskId;

    TaskResultViewIntegrityException(TaskId taskId, String reason) {
        super("task result view integrity check failed for "
                + Objects.requireNonNull(taskId, "taskId")
                + ": " + Objects.requireNonNull(reason, "reason"));
        this.taskId = taskId;
    }

    public TaskId taskId() {
        return taskId;
    }
}
