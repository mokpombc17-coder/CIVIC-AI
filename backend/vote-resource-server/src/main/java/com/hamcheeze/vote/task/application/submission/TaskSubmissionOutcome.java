package com.hamcheeze.vote.task.application.submission;

import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskViolation;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record TaskSubmissionOutcome(
        int httpStatus,
        String code,
        TaskId taskId,
        TaskSubmissionId submissionId,
        Instant submittedAt,
        List<TaskViolation> violations
) {
    public TaskSubmissionOutcome {
        boolean succeeded = httpStatus >= 200 && httpStatus <= 299;
        boolean rejected = httpStatus >= 400 && httpStatus <= 499;
        if (!succeeded && !rejected) {
            throw new IllegalArgumentException(
                    "httpStatus must be a 2xx success or 4xx rejection");
        }
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("code must not be blank");
        }
        code = code.strip();
        Objects.requireNonNull(taskId, "taskId");
        violations = List.copyOf(Objects.requireNonNull(
                violations, "violations"));
        if (succeeded) {
            Objects.requireNonNull(submissionId, "submissionId");
            Objects.requireNonNull(submittedAt, "submittedAt");
            if (!violations.isEmpty()) {
                throw new IllegalArgumentException(
                        "successful outcome cannot contain violations");
            }
        } else if (submissionId != null || submittedAt != null
                || violations.isEmpty()) {
            throw new IllegalArgumentException(
                    "rejected outcome requires violations and no submission");
        }
    }

    public static TaskSubmissionOutcome submitted(
            TaskSubmission submission
    ) {
        Objects.requireNonNull(submission, "submission");
        return new TaskSubmissionOutcome(
                201,
                "TASK_SUBMISSION_CREATED",
                submission.taskId(),
                submission.id(),
                submission.submittedAt(),
                List.of());
    }

    public static TaskSubmissionOutcome rejected(
            int httpStatus,
            String code,
            TaskId taskId,
            List<TaskViolation> violations
    ) {
        return new TaskSubmissionOutcome(
                httpStatus, code, taskId, null, null, violations);
    }

    public boolean succeeded() {
        return httpStatus >= 200 && httpStatus <= 299;
    }
}
