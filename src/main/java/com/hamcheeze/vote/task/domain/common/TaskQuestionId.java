package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskQuestionId(UUID value) {
    public TaskQuestionId {
        value = TaskIdSupport.require(
                value, "TASK_QUESTION_ID_REQUIRED", "questionId");
    }
}
