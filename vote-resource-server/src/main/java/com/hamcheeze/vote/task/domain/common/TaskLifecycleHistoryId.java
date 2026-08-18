package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskLifecycleHistoryId(UUID value) {
    public TaskLifecycleHistoryId {
        value = TaskIdSupport.require(
                value,
                "TASK_LIFECYCLE_HISTORY_ID_REQUIRED",
                "historyId");
    }
}
