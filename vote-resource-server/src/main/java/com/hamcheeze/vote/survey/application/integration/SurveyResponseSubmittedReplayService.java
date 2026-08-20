package com.hamcheeze.vote.survey.application.integration;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseSubmittedReplayAuditRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class SurveyResponseSubmittedReplayService {

    private final IntegrationOutboxRepository outbox;
    private final SurveyResponseSubmittedReplayAuditRepository audits;
    private final Clock clock;
    private final Supplier<UUID> eventIdGenerator;

    @Autowired
    public SurveyResponseSubmittedReplayService(
            IntegrationOutboxRepository outbox,
            SurveyResponseSubmittedReplayAuditRepository audits
    ) {
        this(outbox, audits, Clock.systemUTC(), UUID::randomUUID);
    }

    SurveyResponseSubmittedReplayService(
            IntegrationOutboxRepository outbox,
            SurveyResponseSubmittedReplayAuditRepository audits,
            Clock clock,
            Supplier<UUID> eventIdGenerator
    ) {
        this.outbox = Objects.requireNonNull(outbox, "outbox");
        this.audits = Objects.requireNonNull(audits, "audits");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.eventIdGenerator = Objects.requireNonNull(
                eventIdGenerator, "eventIdGenerator");
    }

    @Transactional
    public ReplayExecution replay(ReplayCommand command) {
        Objects.requireNonNull(command, "command");
        IntegrationOutboxMessage original = outbox
                .findByEventIdForUpdate(command.eventId())
                .orElseThrow(() -> failure(
                        "SURVEY_RESPONSE_SUBMITTED_EVENT_NOT_FOUND",
                        "SurveyResponseSubmitted outbox event does not exist"));
        requireSurveyResponseSubmitted(original);
        requireDeadLetter(original);

        return audits.findByOriginalEventId(command.eventId())
                .map(audit -> new ReplayExecution(audit, false))
                .orElseGet(() -> createReplay(original, command));
    }

    private ReplayExecution createReplay(
            IntegrationOutboxMessage original,
            ReplayCommand command
    ) {
        Instant requestedAt = clock.instant();
        IntegrationEventEnvelope originalEvent = original.event();
        IntegrationEventEnvelope replayEvent = new IntegrationEventEnvelope(
                eventIdGenerator.get(),
                originalEvent.eventType(),
                originalEvent.schemaVersion(),
                originalEvent.occurredAt(),
                originalEvent.aggregateType(),
                originalEvent.aggregateId(),
                originalEvent.payload());
        outbox.insert(IntegrationOutboxMessage.pending(
                replayEvent, requestedAt));
        SurveyResponseSubmittedReplayAudit audit = audits.insert(
                new SurveyResponseSubmittedReplayAudit(
                        originalEvent.eventId(),
                        replayEvent.eventId(),
                        command.requestedBy(),
                        requestedAt,
                        command.reason()));
        return new ReplayExecution(audit, true);
    }

    private static void requireSurveyResponseSubmitted(
            IntegrationOutboxMessage message
    ) {
        if (!SurveyResponseSubmittedV1.EVENT_TYPE.equals(
                message.event().eventType())) {
            throw failure(
                    "SURVEY_RESPONSE_SUBMITTED_EVENT_TYPE_REQUIRED",
                    "only SurveyResponseSubmitted outbox events can be "
                            + "replayed through this command");
        }
    }

    private static void requireDeadLetter(
            IntegrationOutboxMessage message
    ) {
        if (!message.deadLettered()) {
            String state = message.published() ? "DELIVERED" : "PENDING";
            throw failure(
                    "SURVEY_RESPONSE_SUBMITTED_DEAD_LETTER_REQUIRED",
                    "only DEAD_LETTER events can be replayed; current state="
                            + state);
        }
    }

    private static SurveyResponseSubmittedReplayException failure(
            String code,
            String message
    ) {
        return new SurveyResponseSubmittedReplayException(code, message);
    }

    public record ReplayCommand(
            UUID eventId,
            String requestedBy,
            String reason
    ) {
        public ReplayCommand {
            Objects.requireNonNull(eventId, "eventId");
            requestedBy = normalize(
                    requestedBy,
                    "requestedBy",
                    SurveyResponseSubmittedReplayAudit
                            .MAX_REQUESTED_BY_LENGTH);
            reason = normalize(
                    reason,
                    "reason",
                    SurveyResponseSubmittedReplayAudit.MAX_REASON_LENGTH);
        }

        private static String normalize(
                String value,
                String field,
                int maxLength
        ) {
            Objects.requireNonNull(value, field);
            String normalized = value.trim();
            if (normalized.isEmpty() || normalized.length() > maxLength) {
                throw new IllegalArgumentException(
                        field + " must contain 1 to " + maxLength
                                + " trimmed characters");
            }
            return normalized;
        }
    }

    public record ReplayExecution(
            SurveyResponseSubmittedReplayAudit audit,
            boolean created
    ) {
        public ReplayExecution {
            Objects.requireNonNull(audit, "audit");
        }
    }
}
