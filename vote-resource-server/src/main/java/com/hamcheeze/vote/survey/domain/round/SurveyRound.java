package com.hamcheeze.vote.survey.domain.round;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionStatus;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class SurveyRound {

    private final SurveyRoundId id;
    private final SurveyRoundNumber roundNumber;
    private final SurveyContentVersionId contentVersionId;
    private final SurveyRoundStatus status;
    private final SurveyRoundEnforcementMode enforcementMode;
    private final Instant scheduledAt;
    private final Instant activatedAt;
    private final Instant closedAt;
    private final Instant canceledAt;
    private final SurveyRoundId closedByRoundId;
    private final SurveyActorId createdBy;
    private final Instant createdAt;
    private final long rowVersion;

    private SurveyRound(
            SurveyRoundId id,
            SurveyRoundNumber roundNumber,
            SurveyContentVersionId contentVersionId,
            SurveyRoundStatus status,
            SurveyRoundEnforcementMode enforcementMode,
            Instant scheduledAt,
            Instant activatedAt,
            Instant closedAt,
            Instant canceledAt,
            SurveyRoundId closedByRoundId,
            SurveyActorId createdBy,
            Instant createdAt,
            long rowVersion
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.roundNumber = Objects.requireNonNull(roundNumber, "roundNumber");
        this.contentVersionId = Objects.requireNonNull(
                contentVersionId,
                "contentVersionId");
        this.status = Objects.requireNonNull(status, "status");
        this.enforcementMode = enforcementMode;
        this.scheduledAt = scheduledAt;
        this.activatedAt = activatedAt;
        this.closedAt = closedAt;
        this.canceledAt = canceledAt;
        this.closedByRoundId = closedByRoundId;
        this.createdBy = Objects.requireNonNull(createdBy, "createdBy");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        if (rowVersion < 0) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_ROW_VERSION_INVALID",
                    "rowVersion",
                    "rowVersion must not be negative");
        }
        this.rowVersion = rowVersion;
        validateLifecycle();
    }

    static SurveyRoundMutation schedule(
            SurveyRoundId id,
            SurveyRoundNumber roundNumber,
            SurveyContentVersion publishedContent,
            Instant scheduledAt,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            String reason
    ) {
        requireFuture(scheduledAt, now);
        SurveyRound round = new SurveyRound(
                id,
                roundNumber,
                requirePublished(publishedContent),
                SurveyRoundStatus.SCHEDULED,
                null,
                scheduledAt,
                null,
                null,
                null,
                null,
                actor,
                now,
                0);
        return SurveyRoundMutation.changed(
                round,
                SurveyRoundTransition.scheduled(
                        transitionId,
                        round,
                        actor,
                        reason,
                        now));
    }

    static SurveyRoundMutation startPublishedContentNow(
            SurveyRoundId id,
            SurveyRoundNumber roundNumber,
            SurveyContentVersion publishedContent,
            SurveyRoundActivationKind activationKind,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            SurveyRoundTransitionTrigger trigger,
            String reason,
            SurveyRoundId relatedRoundId
    ) {
        validateStartTrigger(trigger);
        SurveyRound round = new SurveyRound(
                id,
                roundNumber,
                requirePublished(publishedContent),
                SurveyRoundStatus.ACTIVE,
                Objects.requireNonNull(
                        activationKind,
                        "activationKind")
                        .initialEnforcementMode(),
                null,
                now,
                null,
                null,
                null,
                actor,
                now,
                0);
        return SurveyRoundMutation.changed(
                round,
                SurveyRoundTransition.activated(
                        transitionId,
                        round,
                        null,
                        actor,
                        trigger,
                        reason,
                        now,
                        relatedRoundId));
    }

    public static SurveyRound rehydrate(
            SurveyRoundId id,
            SurveyRoundNumber roundNumber,
            SurveyContentVersionId contentVersionId,
            SurveyRoundStatus status,
            SurveyRoundEnforcementMode enforcementMode,
            Instant scheduledAt,
            Instant activatedAt,
            Instant closedAt,
            Instant canceledAt,
            SurveyRoundId closedByRoundId,
            SurveyActorId createdBy,
            Instant createdAt,
            long rowVersion
    ) {
        return new SurveyRound(
                id,
                roundNumber,
                contentVersionId,
                status,
                enforcementMode,
                scheduledAt,
                activatedAt,
                closedAt,
                canceledAt,
                closedByRoundId,
                createdBy,
                createdAt,
                rowVersion);
    }

    public SurveyRoundMutation reschedule(
            Instant newScheduledAt,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            String reason
    ) {
        requireStatus(SurveyRoundStatus.SCHEDULED, "reschedule");
        requireFuture(newScheduledAt, now);
        if (scheduledAt.equals(newScheduledAt)) {
            return SurveyRoundMutation.unchanged(this);
        }
        SurveyRound rescheduled = new SurveyRound(
                id,
                roundNumber,
                contentVersionId,
                SurveyRoundStatus.SCHEDULED,
                null,
                newScheduledAt,
                null,
                null,
                null,
                null,
                createdBy,
                createdAt,
                rowVersion);
        return SurveyRoundMutation.changed(
                rescheduled,
                SurveyRoundTransition.rescheduled(
                        transitionId,
                        rescheduled,
                        scheduledAt,
                        actor,
                        reason,
                        now));
    }

    public SurveyRoundMutation cancel(
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            String reason
    ) {
        requireStatus(SurveyRoundStatus.SCHEDULED, "cancel");
        requireNotBefore(now, createdAt, "canceledAt");
        SurveyRound canceled = new SurveyRound(
                id,
                roundNumber,
                contentVersionId,
                SurveyRoundStatus.CANCELED,
                null,
                scheduledAt,
                null,
                null,
                now,
                null,
                createdBy,
                createdAt,
                rowVersion);
        return SurveyRoundMutation.changed(
                canceled,
                SurveyRoundTransition.canceled(
                        transitionId,
                        canceled,
                        actor,
                        reason,
                        now));
    }

    public SurveyRoundMutation requireResponses(
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            String reason
    ) {
        return changeEnforcement(
                SurveyRoundEnforcementMode.REQUIRED,
                actor,
                now,
                transitionId,
                reason);
    }

    public SurveyRoundMutation relaxRequirement(
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            String reason
    ) {
        return changeEnforcement(
                SurveyRoundEnforcementMode.ADVISORY,
                actor,
                now,
                transitionId,
                reason);
    }

    SurveyRoundMutation activate(
            SurveyRoundActivationKind activationKind,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            SurveyRoundTransitionTrigger trigger,
            String reason,
            SurveyRoundId relatedRoundId
    ) {
        requireStatus(SurveyRoundStatus.SCHEDULED, "activate");
        validateActivationTrigger(trigger);
        requireNotBefore(now, createdAt, "activatedAt");
        SurveyRound active = new SurveyRound(
                id,
                roundNumber,
                contentVersionId,
                SurveyRoundStatus.ACTIVE,
                Objects.requireNonNull(
                        activationKind,
                        "activationKind")
                        .initialEnforcementMode(),
                scheduledAt,
                now,
                null,
                null,
                null,
                createdBy,
                createdAt,
                rowVersion);
        return SurveyRoundMutation.changed(
                active,
                SurveyRoundTransition.activated(
                        transitionId,
                        active,
                        SurveyRoundStatus.SCHEDULED,
                        actor,
                        trigger,
                        reason,
                        now,
                        relatedRoundId));
    }

    SurveyRoundMutation closeForNextRound(
            SurveyRoundId nextRoundId,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            SurveyRoundTransitionTrigger trigger,
            String reason
    ) {
        requireStatus(SurveyRoundStatus.ACTIVE, "closeForNextRound");
        Objects.requireNonNull(nextRoundId, "nextRoundId");
        if (id.equals(nextRoundId)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_CANNOT_CLOSE_ITSELF",
                    "closedByRoundId",
                    "round cannot be closed by itself");
        }
        requireNotBefore(now, activatedAt, "closedAt");
        SurveyRound closed = new SurveyRound(
                id,
                roundNumber,
                contentVersionId,
                SurveyRoundStatus.CLOSED,
                enforcementMode,
                scheduledAt,
                activatedAt,
                now,
                null,
                nextRoundId,
                createdBy,
                createdAt,
                rowVersion);
        return SurveyRoundMutation.changed(
                closed,
                SurveyRoundTransition.closed(
                        transitionId,
                        closed,
                        actor,
                        trigger,
                        reason,
                        now,
                        nextRoundId));
    }

    public SurveyRoundId id() {
        return id;
    }

    public SurveyRoundNumber roundNumber() {
        return roundNumber;
    }

    public SurveyContentVersionId contentVersionId() {
        return contentVersionId;
    }

    public SurveyRoundStatus status() {
        return status;
    }

    public Optional<SurveyRoundEnforcementMode> enforcementMode() {
        return Optional.ofNullable(enforcementMode);
    }

    public Optional<Instant> scheduledAt() {
        return Optional.ofNullable(scheduledAt);
    }

    public Optional<Instant> activatedAt() {
        return Optional.ofNullable(activatedAt);
    }

    public Optional<Instant> closedAt() {
        return Optional.ofNullable(closedAt);
    }

    public Optional<Instant> canceledAt() {
        return Optional.ofNullable(canceledAt);
    }

    public Optional<SurveyRoundId> closedByRoundId() {
        return Optional.ofNullable(closedByRoundId);
    }

    public SurveyActorId createdBy() {
        return createdBy;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public long rowVersion() {
        return rowVersion;
    }

    private SurveyRoundMutation changeEnforcement(
            SurveyRoundEnforcementMode targetMode,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionId transitionId,
            String reason
    ) {
        requireStatus(SurveyRoundStatus.ACTIVE, "changeEnforcement");
        if (enforcementMode == targetMode) {
            return SurveyRoundMutation.unchanged(this);
        }
        SurveyRoundTransition.requireReason(reason);
        requireNotBefore(now, activatedAt, "occurredAt");
        SurveyRound changed = new SurveyRound(
                id,
                roundNumber,
                contentVersionId,
                SurveyRoundStatus.ACTIVE,
                targetMode,
                scheduledAt,
                activatedAt,
                null,
                null,
                null,
                createdBy,
                createdAt,
                rowVersion);
        return SurveyRoundMutation.changed(
                changed,
                SurveyRoundTransition.enforcementChanged(
                        transitionId,
                        changed,
                        enforcementMode,
                        actor,
                        reason,
                        now));
    }

    private void validateLifecycle() {
        switch (status) {
            case SCHEDULED -> {
                requirePresent(scheduledAt, "scheduledAt");
                requireAbsent(enforcementMode, "enforcementMode");
                requireAbsent(activatedAt, "activatedAt");
                requireAbsent(closedAt, "closedAt");
                requireAbsent(canceledAt, "canceledAt");
                requireAbsent(closedByRoundId, "closedByRoundId");
            }
            case ACTIVE -> {
                requirePresent(enforcementMode, "enforcementMode");
                requirePresent(activatedAt, "activatedAt");
                requireAbsent(closedAt, "closedAt");
                requireAbsent(canceledAt, "canceledAt");
                requireAbsent(closedByRoundId, "closedByRoundId");
            }
            case CLOSED -> {
                requirePresent(enforcementMode, "enforcementMode");
                requirePresent(activatedAt, "activatedAt");
                requirePresent(closedAt, "closedAt");
                requirePresent(closedByRoundId, "closedByRoundId");
                requireAbsent(canceledAt, "canceledAt");
            }
            case CANCELED -> {
                requirePresent(scheduledAt, "scheduledAt");
                requirePresent(canceledAt, "canceledAt");
                requireAbsent(enforcementMode, "enforcementMode");
                requireAbsent(activatedAt, "activatedAt");
                requireAbsent(closedAt, "closedAt");
                requireAbsent(closedByRoundId, "closedByRoundId");
            }
        }
        if (scheduledAt != null && scheduledAt.isBefore(createdAt)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_SCHEDULE_TIME_INVALID",
                    "scheduledAt",
                    "scheduledAt must not be before createdAt");
        }
        if (activatedAt != null && activatedAt.isBefore(createdAt)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_ACTIVATION_TIME_INVALID",
                    "activatedAt",
                    "activatedAt must not be before createdAt");
        }
        if (closedAt != null && closedAt.isBefore(activatedAt)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_CLOSE_TIME_INVALID",
                    "closedAt",
                    "closedAt must not be before activatedAt");
        }
        if (canceledAt != null && canceledAt.isBefore(createdAt)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_CANCEL_TIME_INVALID",
                    "canceledAt",
                    "canceledAt must not be before createdAt");
        }
    }

    private void requireStatus(
            SurveyRoundStatus expected,
            String command
    ) {
        if (status != expected) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_STATE_INVALID",
                    "status",
                    command + " requires " + expected + " status");
        }
    }

    private static SurveyContentVersionId requirePublished(
            SurveyContentVersion contentVersion
    ) {
        Objects.requireNonNull(contentVersion, "contentVersion");
        if (contentVersion.status() != SurveyContentVersionStatus.PUBLISHED) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_REQUIRES_PUBLISHED_CONTENT",
                    "contentVersionId",
                    "round requires a published content version");
        }
        return contentVersion.id();
    }

    private static void requireFuture(Instant scheduledAt, Instant now) {
        Objects.requireNonNull(scheduledAt, "scheduledAt");
        Objects.requireNonNull(now, "now");
        if (!scheduledAt.isAfter(now)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_SCHEDULE_MUST_BE_FUTURE",
                    "scheduledAt",
                    "scheduledAt must be in the future");
        }
    }

    private static void requireNotBefore(
            Instant value,
            Instant lowerBound,
            String path
    ) {
        Objects.requireNonNull(value, path);
        if (value.isBefore(lowerBound)) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_TIME_INVALID",
                    path,
                    path + " must not move backwards");
        }
    }

    private static void requirePresent(Object value, String path) {
        if (value == null) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_REQUIRED_FIELD_MISSING",
                    path,
                    path + " is required for current status");
        }
    }

    private static void requireAbsent(Object value, String path) {
        if (value != null) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_FORBIDDEN_FIELD_PRESENT",
                    path,
                    path + " is forbidden for current status");
        }
    }

    private static void validateStartTrigger(
            SurveyRoundTransitionTrigger trigger
    ) {
        Objects.requireNonNull(trigger, "trigger");
        if (trigger != SurveyRoundTransitionTrigger.ADMIN_START_NOW
                && trigger != SurveyRoundTransitionTrigger.ADMIN_RECOVERY
                && trigger != SurveyRoundTransitionTrigger.LOCAL_BOOTSTRAP) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_START_TRIGGER_INVALID",
                    "trigger",
                    "invalid immediate start trigger");
        }
    }

    private static void validateActivationTrigger(
            SurveyRoundTransitionTrigger trigger
    ) {
        Objects.requireNonNull(trigger, "trigger");
        if (trigger != SurveyRoundTransitionTrigger.ADMIN_START_NOW
                && trigger != SurveyRoundTransitionTrigger.SCHEDULER
                && trigger != SurveyRoundTransitionTrigger.SCHEDULER_RECOVERY
                && trigger != SurveyRoundTransitionTrigger.ADMIN_RECOVERY) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_ACTIVATION_TRIGGER_INVALID",
                    "trigger",
                    "invalid scheduled activation trigger");
        }
    }
}
