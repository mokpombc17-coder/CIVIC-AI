package com.hamcheeze.vote.task.application.idempotency;

import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;

public record StoredTaskSubmissionOutcome(
        int schemaVersion,
        int httpStatus,
        String payload,
        TaskSubmissionId submissionId
) {
    public StoredTaskSubmissionOutcome {
        if (schemaVersion <= 0) {
            throw new IllegalArgumentException("schemaVersion must be positive");
        }
        boolean succeeded = httpStatus >= 200 && httpStatus <= 299;
        boolean rejected = httpStatus >= 400 && httpStatus <= 499;
        if (!succeeded && !rejected) {
            throw new IllegalArgumentException(
                    "httpStatus must be a 2xx success or 4xx rejection");
        }
        if (payload == null || payload.isBlank()) {
            throw new IllegalArgumentException("payload must not be blank");
        }
        if (succeeded && submissionId == null) {
            throw new IllegalArgumentException(
                    "successful outcome requires submissionId");
        }
        if (rejected && submissionId != null) {
            throw new IllegalArgumentException(
                    "rejected outcome must not have submissionId");
        }
    }

    public boolean succeeded() {
        return httpStatus >= 200 && httpStatus <= 299;
    }
}
