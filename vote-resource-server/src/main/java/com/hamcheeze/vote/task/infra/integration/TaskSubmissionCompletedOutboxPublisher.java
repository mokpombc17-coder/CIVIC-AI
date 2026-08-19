package com.hamcheeze.vote.task.infra.integration;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerSource;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerType;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.AnswerV1;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1.SelectionV1;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionCompletedEventPublisher;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
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
        TaskSubmissionCompletedV1 payload = payload(submission);
        outbox.insert(IntegrationOutboxMessage.pending(
                envelope(payload), submission.submittedAt()));
    }

    private TaskSubmissionCompletedV1 payload(TaskSubmission submission) {
        return new TaskSubmissionCompletedV1(
                submission.userId().value(),
                submission.id().value(),
                submission.taskId().value(),
                submission.predictionId().value(),
                submission.personaGenerationId().value(),
                submission.personaVersionId().value(),
                submission.submittedAt(),
                List.of(answer(submission)));
    }

    private AnswerV1 answer(TaskSubmission submission) {
        return new AnswerV1(
                submission.questionId().value(),
                AnswerType.SINGLE_CHOICE,
                submission.reasonSource() == TaskReasonSource.AI_ACCEPTED
                        ? AnswerSource.AI_ACCEPTED
                        : AnswerSource.USER_ANSWERED,
                submission.acceptedPredictedReasonId() == null
                        ? null
                        : submission.acceptedPredictedReasonId().value(),
                null,
                null,
                null,
                List.of(new SelectionV1(
                        submission.selectedOptionId().value(), null)));
    }

    private IntegrationEventEnvelope envelope(
            TaskSubmissionCompletedV1 payload
    ) {
        try {
            return new IntegrationEventEnvelope(
                    UUID.randomUUID(),
                    TaskSubmissionCompletedV1.EVENT_TYPE,
                    TaskSubmissionCompletedV1.SCHEMA_VERSION,
                    payload.submittedAt(),
                    TaskSubmissionCompletedV1.AGGREGATE_TYPE,
                    payload.submissionId(),
                    objectMapper.writeValueAsString(payload));
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to serialize TaskSubmissionCompletedV1",
                    exception);
        }
    }
}
