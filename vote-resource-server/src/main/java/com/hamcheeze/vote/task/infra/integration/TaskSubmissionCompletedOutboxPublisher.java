package com.hamcheeze.vote.task.infra.integration;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2.ReasonSource;
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
        TaskSubmissionCompletedV2 payload = payload(submission);
        outbox.insert(IntegrationOutboxMessage.pending(
                envelope(payload), submission.submittedAt()));
    }

    private TaskSubmissionCompletedV2 payload(TaskSubmission submission) {
        return new TaskSubmissionCompletedV2(
                submission.userId().value(),
                submission.id().value(),
                submission.taskId().value(),
                submission.predictionId().value(),
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
            TaskSubmissionCompletedV2 payload
    ) {
        try {
            return new IntegrationEventEnvelope(
                    UUID.randomUUID(),
                    TaskSubmissionCompletedV2.EVENT_TYPE,
                    TaskSubmissionCompletedV2.SCHEMA_VERSION,
                    payload.submittedAt(),
                    TaskSubmissionCompletedV2.AGGREGATE_TYPE,
                    payload.submissionId(),
                    objectMapper.writeValueAsString(payload));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to serialize TaskSubmissionCompletedV2",
                    exception);
        }
    }
}
