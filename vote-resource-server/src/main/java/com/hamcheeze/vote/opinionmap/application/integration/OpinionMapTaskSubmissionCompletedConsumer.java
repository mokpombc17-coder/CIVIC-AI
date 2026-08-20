package com.hamcheeze.vote.opinionmap.application.integration;

import com.hamcheeze.vote.opinionmap.application.finalization.OpinionMapFinalizationCoordinator;
import com.hamcheeze.vote.opinionmap.application.finalization.OpinionMapSnapshotAlreadyFinalizedException;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapInboxRepository;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumer;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV2;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV3;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

@Component
public class OpinionMapTaskSubmissionCompletedConsumer
        implements IntegrationEventConsumer {

    public static final String CONSUMER_NAME =
            "opinionmap-task-submission-completed-v2";

    private final OpinionMapInboxRepository inbox;
    private final OpinionMapSubmissionProjectionRepository submissions;
    private final OpinionMapFinalizationCoordinator finalizations;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public OpinionMapTaskSubmissionCompletedConsumer(
            OpinionMapInboxRepository inbox,
            OpinionMapSubmissionProjectionRepository submissions,
            OpinionMapFinalizationCoordinator finalizations,
            ObjectMapper objectMapper
    ) {
        this(inbox, submissions, finalizations, objectMapper,
                Clock.systemUTC());
    }

    OpinionMapTaskSubmissionCompletedConsumer(
            OpinionMapInboxRepository inbox,
            OpinionMapSubmissionProjectionRepository submissions,
            OpinionMapFinalizationCoordinator finalizations,
            ObjectMapper objectMapper,
            Clock clock
    ) {
        this.inbox = Objects.requireNonNull(inbox, "inbox");
        this.submissions = Objects.requireNonNull(
                submissions, "submissions");
        this.finalizations = Objects.requireNonNull(
                finalizations, "finalizations");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Override
    public String consumerName() {
        return CONSUMER_NAME;
    }

    @Override
    public String eventType() {
        return TaskSubmissionCompletedV2.EVENT_TYPE;
    }

    @Override
    @Transactional
    public void consume(IntegrationEventEnvelope event) {
        Objects.requireNonNull(event, "event");
        validateEnvelope(event);
        SubmissionPayload payload = decodePayload(event);
        validateCorrelation(event, payload);

        boolean receiptAlreadyRecorded = hasRecordedReceipt(event);
        OpinionMapSubmissionProjection submission = mapSubmission(payload);
        try {
            finalizations.prepareProjection(
                    submission.taskId(), submission.submissionId());
        } catch (OpinionMapSnapshotAlreadyFinalizedException exception) {
            throw new IntegrationEventConsumptionException(
                    "OPINION_MAP_SNAPSHOT_ALREADY_FINALIZED",
                    false,
                    "submission cannot be projected after snapshot finalization",
                    exception);
        }
        if (!submissions.insertIfAbsent(submission)) {
            OpinionMapSubmissionProjection existing = submissions.findBySubmissionId(
                            submission.submissionId())
                    .orElseThrow(() -> retryable(
                            "OPINION_MAP_SUBMISSION_UNAVAILABLE",
                            "opinion map submission projection is unavailable after conflict"));
            if (!existing.equals(submission)) {
                throw nonRetryable(
                        "OPINION_MAP_SUBMISSION_CONFLICT",
                        "submissionId was delivered with different facts");
            }
        }

        finalizations.reassess(submission.taskId());

        if (receiptAlreadyRecorded) {
            return;
        }

        OpinionMapInboxReceipt receipt = OpinionMapInboxReceipt.from(
                CONSUMER_NAME, event, clock.instant());
        if (inbox.recordIfAbsent(receipt)) {
            return;
        }

        OpinionMapInboxReceipt existing = inbox.find(
                        CONSUMER_NAME, event.eventId())
                .orElseThrow(() -> new IntegrationEventConsumptionException(
                        "OPINION_MAP_INBOX_RECEIPT_UNAVAILABLE",
                        true,
                        "opinion map inbox receipt is unavailable after conflict"));
        if (!existing.hasSameEvent(event)) {
            throw nonRetryable(
                    "OPINION_MAP_INBOX_EVENT_CONFLICT",
                    "eventId was redelivered with different event content");
        }
    }

    private boolean hasRecordedReceipt(IntegrationEventEnvelope event) {
        return inbox.find(CONSUMER_NAME, event.eventId())
                .map(existing -> {
                    if (!existing.hasSameEvent(event)) {
                        throw nonRetryable(
                                "OPINION_MAP_INBOX_EVENT_CONFLICT",
                                "eventId was redelivered with different "
                                        + "event content");
                    }
                    return true;
                })
                .orElse(false);
    }

    private static OpinionMapSubmissionProjection mapSubmission(
            SubmissionPayload payload
    ) {
        try {
            return new OpinionMapSubmissionProjection(
                    payload.submissionId(),
                    payload.userId(),
                    payload.taskId(),
                    payload.predictionId(),
                    payload.personaGenerationId(),
                    payload.personaVersionId(),
                    payload.questionId(),
                    payload.selectedOptionId(),
                    OpinionMapReasonSource.valueOf(payload.reasonSource()),
                    payload.acceptedPredictedReasonId(),
                    payload.finalReason(),
                    payload.submittedAt());
        } catch (IllegalArgumentException exception) {
            throw new IntegrationEventConsumptionException(
                    "OPINION_MAP_EVENT_PAYLOAD_INVALID",
                    false,
                    "task submission completed payload is invalid",
                    exception);
        }
    }

    private static void validateEnvelope(IntegrationEventEnvelope event) {
        if (!TaskSubmissionCompletedV3.EVENT_TYPE.equals(event.eventType())) {
            throw nonRetryable(
                    "OPINION_MAP_EVENT_TYPE_UNSUPPORTED",
                    "unsupported event type: " + event.eventType());
        }
        if (event.schemaVersion() != TaskSubmissionCompletedV2.SCHEMA_VERSION
                && event.schemaVersion()
                != TaskSubmissionCompletedV3.SCHEMA_VERSION) {
            throw nonRetryable(
                    "OPINION_MAP_EVENT_SCHEMA_UNSUPPORTED",
                    "unsupported event schema version: "
                            + event.schemaVersion());
        }
        if (!TaskSubmissionCompletedV3.AGGREGATE_TYPE.equals(
                event.aggregateType())) {
            throw nonRetryable(
                    "OPINION_MAP_EVENT_AGGREGATE_TYPE_UNSUPPORTED",
                    "unsupported aggregate type: " + event.aggregateType());
        }
    }

    private SubmissionPayload decodePayload(
            IntegrationEventEnvelope event
    ) {
        try {
            if (event.schemaVersion()
                    == TaskSubmissionCompletedV2.SCHEMA_VERSION) {
                return SubmissionPayload.from(objectMapper.readValue(
                        event.payload(), TaskSubmissionCompletedV2.class));
            }
            return SubmissionPayload.from(objectMapper.readValue(
                    event.payload(), TaskSubmissionCompletedV3.class));
        } catch (Exception exception) {
            throw new IntegrationEventConsumptionException(
                    "OPINION_MAP_EVENT_PAYLOAD_INVALID",
                    false,
                    "task submission completed payload is invalid",
                    exception);
        }
    }

    private static void validateCorrelation(
            IntegrationEventEnvelope event,
            SubmissionPayload payload
    ) {
        if (!event.aggregateId().equals(payload.submissionId())) {
            throw nonRetryable(
                    "OPINION_MAP_EVENT_AGGREGATE_MISMATCH",
                    "event aggregateId does not match payload submissionId");
        }
        if (!event.occurredAt().truncatedTo(ChronoUnit.MICROS).equals(
                payload.submittedAt().truncatedTo(ChronoUnit.MICROS))) {
            throw nonRetryable(
                    "OPINION_MAP_EVENT_OCCURRED_AT_MISMATCH",
                    "event occurredAt does not match payload submittedAt");
        }
    }

    private static IntegrationEventConsumptionException nonRetryable(
            String errorCode,
            String message
    ) {
        return new IntegrationEventConsumptionException(
                errorCode, false, message);
    }

    private static IntegrationEventConsumptionException retryable(
            String errorCode,
            String message
    ) {
        return new IntegrationEventConsumptionException(
                errorCode, true, message);
    }

    private record SubmissionPayload(
            String userId,
            java.util.UUID submissionId,
            java.util.UUID taskId,
            java.util.UUID predictionId,
            java.util.UUID personaGenerationId,
            java.util.UUID personaVersionId,
            java.util.UUID questionId,
            java.util.UUID selectedOptionId,
            String reasonSource,
            java.util.UUID acceptedPredictedReasonId,
            String finalReason,
            java.time.Instant submittedAt
    ) {
        private static SubmissionPayload from(TaskSubmissionCompletedV2 value) {
            return new SubmissionPayload(
                    value.userId(), value.submissionId(), value.taskId(),
                    value.predictionId(), value.personaGenerationId(),
                    value.personaVersionId(), value.questionId(),
                    value.selectedOptionId(), value.reasonSource().name(),
                    value.acceptedPredictedReasonId(), value.finalReason(),
                    value.submittedAt());
        }

        private static SubmissionPayload from(TaskSubmissionCompletedV3 value) {
            return new SubmissionPayload(
                    value.userId(), value.submissionId(), value.taskId(),
                    value.predictionId(), value.personaGenerationId(),
                    value.personaVersionId(), value.questionId(),
                    value.selectedOptionId(), value.reasonSource().name(),
                    value.acceptedPredictedReasonId(), value.finalReason(),
                    value.submittedAt());
        }
    }
}
