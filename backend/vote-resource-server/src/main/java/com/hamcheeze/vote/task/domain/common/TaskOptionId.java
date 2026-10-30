package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskOptionId(UUID value) {
    public TaskOptionId {
        value = TaskIdSupport.require(
                value, "TASK_OPTION_ID_REQUIRED", "optionId");
    }
}
