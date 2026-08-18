package com.hamcheeze.vote.task.domain.common;

import java.util.UUID;

public record TaskSubmissionId(UUID value) {
    public TaskSubmissionId {
        value = TaskIdSupport.require(
                value, "TASK_SUBMISSION_ID_REQUIRED", "submissionId");
    }
}
