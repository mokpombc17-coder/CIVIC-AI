package com.hamcheeze.vote.task.application.submission;

import com.hamcheeze.vote.task.application.idempotency.StoredTaskSubmissionOutcome;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyOutcomeCodec;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.Objects;

@Component
public class TaskSubmissionOutcomeCodec
        implements TaskIdempotencyOutcomeCodec<TaskSubmissionOutcome> {

    public static final int SCHEMA_VERSION = 1;

    private final ObjectMapper objectMapper;

    public TaskSubmissionOutcomeCodec(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
    }

    @Override
    public StoredTaskSubmissionOutcome encode(
            TaskSubmissionOutcome outcome
    ) {
        Objects.requireNonNull(outcome, "outcome");
        try {
            return new StoredTaskSubmissionOutcome(
                    SCHEMA_VERSION,
                    outcome.httpStatus(),
                    objectMapper.writeValueAsString(outcome),
                    outcome.submissionId());
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to encode task submission outcome", exception);
        }
    }

    @Override
    public TaskSubmissionOutcome decode(
            StoredTaskSubmissionOutcome storedOutcome
    ) {
        Objects.requireNonNull(storedOutcome, "storedOutcome");
        if (storedOutcome.schemaVersion() != SCHEMA_VERSION) {
            throw new IllegalStateException(
                    "unsupported task submission outcome schema: "
                            + storedOutcome.schemaVersion());
        }
        try {
            return objectMapper.readValue(
                    storedOutcome.payload(), TaskSubmissionOutcome.class);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to decode task submission outcome", exception);
        }
    }
}
