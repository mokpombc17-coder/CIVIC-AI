package com.hamcheeze.vote.task.infra.integration;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV3;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV3.ReasonSource;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionCompletedEventPublisher;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.Objects;
import java.util.UUID;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.submission-outbox",
        name = "enabled",
        havingValue = "true")
public class TaskSubmissionCompletedOutboxPublisher
        implements TaskSubmissionCompletedEventPublisher {

    private final IntegrationOutboxRepository outbox;
    private final ObjectMapper objectMapper;

    public TaskSubmissionCompletedOutboxPublisher(
            IntegrationOutboxRepository outbox,
            ObjectMapper objectMapper
    ) {
        this.outbox = Objects.requireNonNull(outbox, "outbox");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public void publish(TaskSubmission submission) {
        Objects.requireNonNull(submission, "submission");
        TaskSubmissionCompletedV3 payload = payload(submission);
        outbox.insert(IntegrationOutboxMessage.pending(
                envelope(payload), submission.submittedAt()));
    }

    private TaskSubmissionCompletedV3 payload(TaskSubmission submission) {
        return new TaskSubmissionCompletedV3(
                submission.userId().value(),
                submission.id().value(),
                submission.taskId().value(),
                submission.predictionId() == null
                        ? null : submission.predictionId().value(),
                submission.personaGenerationId().value(),
                submission.personaVersionId().value(),
                submission.questionId().value(),
                submission.selectedOptionId().value(),
                ReasonSource.valueOf(submission.reasonSource().name()),
                submission.acceptedPredictedReasonId() == null
                        ? null
                        : submission.acceptedPredictedReasonId().value(),
                submission.finalReason(),
                submission.submittedAt());
    }

    private IntegrationEventEnvelope envelope(
            TaskSubmissionCompletedV3 payload
    ) {
        try {
            return new IntegrationEventEnvelope(
                    UUID.randomUUID(),
                    TaskSubmissionCompletedV3.EVENT_TYPE,
                    TaskSubmissionCompletedV3.SCHEMA_VERSION,
                    payload.submittedAt(),
                    TaskSubmissionCompletedV3.AGGREGATE_TYPE,
                    payload.submissionId(),
                    objectMapper.writeValueAsString(payload));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to serialize TaskSubmissionCompletedV3",
                    exception);
        }
    }
}
