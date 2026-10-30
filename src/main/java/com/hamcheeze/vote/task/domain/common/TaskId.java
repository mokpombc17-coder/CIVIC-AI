package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskId(UUID value) {
    public TaskId {
        value = TaskIdSupport.require(value, "TASK_ID_REQUIRED", "taskId");
    }
}
