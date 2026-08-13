package com.hamcheeze.vote.survey.domain.round;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class SurveyRoundTransition {

    public static final int MAX_REASON_LENGTH = 500;

    private final SurveyRoundTransitionId id;
    private final SurveyRoundId roundId;
    private final SurveyContentVersionId contentVersionId;
    private final SurveyRoundTransitionType type;
    private final SurveyRoundStatus fromStatus;
    private final SurveyRoundStatus toStatus;
    private final SurveyRoundEnforcementMode fromEnforcementMode;
    private final SurveyRoundEnforcementMode toEnforcementMode;
    private final Instant previousScheduledAt;
    private final Instant newScheduledAt;
    private final SurveyActorId actorId;
    private final SurveyRoundTransitionTrigger trigger;
    private final String reason;
    private final Instant occurredAt;
    private final SurveyRoundId relatedRoundId;

    private SurveyRoundTransition(
            SurveyRoundTransitionId id,
            SurveyRoundId roundId,
            SurveyContentVersionId contentVersionId,
            SurveyRoundTransitionType type,
            SurveyRoundStatus fromStatus,
            SurveyRoundStatus toStatus,
            SurveyRoundEnforcementMode fromEnforcementMode,
            SurveyRoundEnforcementMode toEnforcementMode,
            Instant previousScheduledAt,
            Instant newScheduledAt,
            SurveyActorId actorId,
            SurveyRoundTransitionTrigger trigger,
            String reason,
            Instant occurredAt,
            SurveyRoundId relatedRoundId
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.roundId = Objects.requireNonNull(roundId, "roundId");
        this.contentVersionId = Objects.requireNonNull(
                contentVersionId,
                "contentVersionId");
        this.type = Objects.requireNonNull(type, "type");
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.fromEnforcementMode = fromEnforcementMode;
        this.toEnforcementMode = toEnforcementMode;
        this.previousScheduledAt = previousScheduledAt;
        this.newScheduledAt = newScheduledAt;
        this.actorId = Objects.requireNonNull(actorId, "actorId");
        this.trigger = Objects.requireNonNull(trigger, "trigger");
        this.reason = normalizeReason(reason);
        this.occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        this.relatedRoundId = relatedRoundId;
    }

    static SurveyRoundTransition scheduled(
            SurveyRoundTransitionId id,
            SurveyRound round,
            SurveyActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        return new SurveyRoundTransition(
                id,
                round.id(),
                round.contentVersionId(),
                SurveyRoundTransitionType.SCHEDULED,
                null,
                SurveyRoundStatus.SCHEDULED,
                null,
                null,
                null,
                round.scheduledAt().orElseThrow(),
                actorId,
                SurveyRoundTransitionTrigger.ADMIN_SCHEDULE,
                reason,
                occurredAt,
                null);
    }

    static SurveyRoundTransition rescheduled(
            SurveyRoundTransitionId id,
            SurveyRound round,
            Instant previousScheduledAt,
            SurveyActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        return new SurveyRoundTransition(
                id,
                round.id(),
                round.contentVersionId(),
                SurveyRoundTransitionType.RESCHEDULED,
                SurveyRoundStatus.SCHEDULED,
                SurveyRoundStatus.SCHEDULED,
                null,
                null,
                previousScheduledAt,
                round.scheduledAt().orElseThrow(),
                actorId,
                SurveyRoundTransitionTrigger.ADMIN_RESCHEDULE,
                reason,
                occurredAt,
                null);
    }

    static SurveyRoundTransition canceled(
            SurveyRoundTransitionId id,
            SurveyRound round,
            SurveyActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        return new SurveyRoundTransition(
                id,
                round.id(),
                round.contentVersionId(),
                SurveyRoundTransitionType.CANCELED,
                SurveyRoundStatus.SCHEDULED,
                SurveyRoundStatus.CANCELED,
                null,
                null,
                round.scheduledAt().orElseThrow(),
                round.scheduledAt().orElseThrow(),
                actorId,
                SurveyRoundTransitionTrigger.ADMIN_CANCEL,
                reason,
                occurredAt,
                null);
    }

    static SurveyRoundTransition activated(
            SurveyRoundTransitionId id,
            SurveyRound round,
            SurveyRoundStatus fromStatus,
            SurveyActorId actorId,
            SurveyRoundTransitionTrigger trigger,
            String reason,
            Instant occurredAt,
            SurveyRoundId relatedRoundId
    ) {
        return new SurveyRoundTransition(
                id,
                round.id(),
                round.contentVersionId(),
                SurveyRoundTransitionType.ACTIVATED,
                fromStatus,
                SurveyRoundStatus.ACTIVE,
                null,
                round.enforcementMode().orElseThrow(),
                round.scheduledAt().orElse(null),
                round.scheduledAt().orElse(null),
                actorId,
                trigger,
                reason,
                occurredAt,
                relatedRoundId);
    }

    static SurveyRoundTransition closed(
            SurveyRoundTransitionId id,
            SurveyRound round,
            SurveyActorId actorId,
            SurveyRoundTransitionTrigger trigger,
            String reason,
            Instant occurredAt,
            SurveyRoundId nextRoundId
    ) {
        return new SurveyRoundTransition(
                id,
                round.id(),
                round.contentVersionId(),
                SurveyRoundTransitionType.CLOSED,
                SurveyRoundStatus.ACTIVE,
                SurveyRoundStatus.CLOSED,
                round.enforcementMode().orElseThrow(),
                round.enforcementMode().orElseThrow(),
                round.scheduledAt().orElse(null),
                round.scheduledAt().orElse(null),
                actorId,
                trigger,
                reason,
                occurredAt,
                nextRoundId);
    }

    static SurveyRoundTransition enforcementChanged(
            SurveyRoundTransitionId id,
            SurveyRound round,
            SurveyRoundEnforcementMode previousMode,
            SurveyActorId actorId,
            String reason,
            Instant occurredAt
    ) {
        SurveyRoundEnforcementMode newMode =
                round.enforcementMode().orElseThrow();
        SurveyRoundTransitionType type =
                newMode == SurveyRoundEnforcementMode.REQUIRED
                        ? SurveyRoundTransitionType.ENFORCEMENT_REQUIRED
                        : SurveyRoundTransitionType.ENFORCEMENT_RELAXED;
        return new SurveyRoundTransition(
                id,
                round.id(),
                round.contentVersionId(),
                type,
                SurveyRoundStatus.ACTIVE,
                SurveyRoundStatus.ACTIVE,
                previousMode,
                newMode,
                round.scheduledAt().orElse(null),
                round.scheduledAt().orElse(null),
                actorId,
                SurveyRoundTransitionTrigger.ADMIN_ENFORCEMENT_CHANGE,
                requireReason(reason),
                occurredAt,
                null);
    }

    public SurveyRoundTransitionId id() {
        return id;
    }

    public SurveyRoundId roundId() {
        return roundId;
    }

    public SurveyContentVersionId contentVersionId() {
        return contentVersionId;
    }

    public SurveyRoundTransitionType type() {
        return type;
    }

    public Optional<SurveyRoundStatus> fromStatus() {
        return Optional.ofNullable(fromStatus);
    }

    public Optional<SurveyRoundStatus> toStatus() {
        return Optional.ofNullable(toStatus);
    }

    public Optional<SurveyRoundEnforcementMode> fromEnforcementMode() {
        return Optional.ofNullable(fromEnforcementMode);
    }

    public Optional<SurveyRoundEnforcementMode> toEnforcementMode() {
        return Optional.ofNullable(toEnforcementMode);
    }

    public Optional<Instant> previousScheduledAt() {
        return Optional.ofNullable(previousScheduledAt);
    }

    public Optional<Instant> newScheduledAt() {
        return Optional.ofNullable(newScheduledAt);
    }

    public SurveyActorId actorId() {
        return actorId;
    }

    public SurveyRoundTransitionTrigger trigger() {
        return trigger;
    }

    public Optional<String> reason() {
        return Optional.ofNullable(reason);
    }

    public Instant occurredAt() {
        return occurredAt;
    }

    public Optional<SurveyRoundId> relatedRoundId() {
        return Optional.ofNullable(relatedRoundId);
    }

    static String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) {
            return null;
        }
        String normalized = reason.strip();
        if (normalized.codePointCount(0, normalized.length())
                > MAX_REASON_LENGTH) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_REASON_TOO_LONG",
                    "reason",
                    "reason must have at most " + MAX_REASON_LENGTH
                            + " characters");
        }
        return normalized;
    }

    static String requireReason(String reason) {
        String normalized = normalizeReason(reason);
        if (normalized == null) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_ENFORCEMENT_REASON_REQUIRED",
                    "reason",
                    "enforcement change reason is required");
        }
        return normalized;
    }
}
