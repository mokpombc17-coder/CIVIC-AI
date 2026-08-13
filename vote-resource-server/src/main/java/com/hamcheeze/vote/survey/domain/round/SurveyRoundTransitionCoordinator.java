package com.hamcheeze.vote.survey.domain.round;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class SurveyRoundTransitionCoordinator {

    private final SurveyRoundTransitionIdGenerator transitionIdGenerator;

    public SurveyRoundTransitionCoordinator(
            SurveyRoundTransitionIdGenerator transitionIdGenerator
    ) {
        this.transitionIdGenerator = Objects.requireNonNull(
                transitionIdGenerator,
                "transitionIdGenerator");
    }

    public SurveyRoundMutation schedule(
            Optional<SurveyRound> existingScheduledRound,
            SurveyRoundId id,
            SurveyRoundNumber roundNumber,
            SurveyContentVersion publishedContent,
            Instant scheduledAt,
            SurveyActorId actor,
            Instant now,
            String reason
    ) {
        Objects.requireNonNull(
                existingScheduledRound,
                "existingScheduledRound");
        if (existingScheduledRound.isPresent()) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_SCHEDULE_ALREADY_EXISTS",
                    "scheduledRound",
                    "only one scheduled round is allowed");
        }
        return SurveyRound.schedule(
                id,
                roundNumber,
                publishedContent,
                scheduledAt,
                actor,
                now,
                transitionIdGenerator.nextTransitionId(),
                reason);
    }

    public SurveyRoundActivationPlan startPublishedContentNow(
            Optional<SurveyRound> currentActiveRound,
            Optional<SurveyRound> existingScheduledRound,
            SurveyRoundId newRoundId,
            SurveyRoundNumber roundNumber,
            SurveyContentVersion publishedContent,
            SurveyRoundActivationKind activationKind,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionTrigger trigger,
            String reason
    ) {
        validateCurrentActive(currentActiveRound);
        Objects.requireNonNull(
                existingScheduledRound,
                "existingScheduledRound");
        if (existingScheduledRound.isPresent()) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_SCHEDULE_BLOCKS_IMMEDIATE_START",
                    "scheduledRound",
                    "cancel or start the scheduled round first");
        }
        validateActivationKind(currentActiveRound, activationKind);
        SurveyRoundMutation closedRound = closeCurrentIfPresent(
                currentActiveRound,
                newRoundId,
                actor,
                now,
                trigger,
                reason);
        SurveyRoundMutation activated = SurveyRound.startPublishedContentNow(
                newRoundId,
                roundNumber,
                publishedContent,
                activationKind,
                actor,
                now,
                transitionIdGenerator.nextTransitionId(),
                trigger,
                reason,
                closedRound == null ? null : closedRound.round().id());
        return changedPlan(closedRound, activated);
    }

    public SurveyRoundActivationPlan startScheduledRoundNow(
            Optional<SurveyRound> currentActiveRound,
            SurveyRound scheduledRound,
            SurveyRoundActivationKind activationKind,
            SurveyActorId actor,
            Instant now,
            String reason
    ) {
        return activateScheduled(
                currentActiveRound,
                scheduledRound,
                activationKind,
                actor,
                now,
                SurveyRoundTransitionTrigger.ADMIN_START_NOW,
                reason,
                false);
    }

    public SurveyRoundActivationPlan activateDueRound(
            Optional<SurveyRound> currentActiveRound,
            SurveyRound scheduledRound,
            SurveyRoundActivationKind activationKind,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionTrigger trigger
    ) {
        if (!Objects.requireNonNull(trigger, "trigger").isScheduler()) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_SCHEDULER_TRIGGER_REQUIRED",
                    "trigger",
                    "scheduler activation requires a scheduler trigger");
        }
        return activateScheduled(
                currentActiveRound,
                scheduledRound,
                activationKind,
                actor,
                now,
                trigger,
                null,
                true);
    }

    private SurveyRoundActivationPlan activateScheduled(
            Optional<SurveyRound> currentActiveRound,
            SurveyRound target,
            SurveyRoundActivationKind activationKind,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionTrigger trigger,
            String reason,
            boolean schedulerAttempt
    ) {
        Objects.requireNonNull(currentActiveRound, "currentActiveRound");
        Objects.requireNonNull(target, "target");
        Objects.requireNonNull(actor, "actor");
        Objects.requireNonNull(now, "now");
        validateCurrentActive(currentActiveRound);

        if (target.status() == SurveyRoundStatus.ACTIVE) {
            if (currentActiveRound.isEmpty()
                    || currentActiveRound.get().id().equals(target.id())) {
                return SurveyRoundActivationPlan.unchanged(target);
            }
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_ACTIVE_CONFLICT",
                    "activeRound",
                    "target is active but another active round was supplied");
        }
        if (target.status() == SurveyRoundStatus.CANCELED
                || target.status() == SurveyRoundStatus.CLOSED) {
            if (schedulerAttempt) {
                return SurveyRoundActivationPlan.unchanged(target);
            }
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_STATE_INVALID",
                    "status",
                    "terminal round cannot be activated");
        }
        if (schedulerAttempt
                && target.scheduledAt().orElseThrow().isAfter(now)) {
            return SurveyRoundActivationPlan.unchanged(target);
        }

        validateActivationKind(currentActiveRound, activationKind);
        SurveyRoundMutation closedRound = closeCurrentIfPresent(
                currentActiveRound,
                target.id(),
                actor,
                now,
                trigger,
                reason);
        SurveyRoundMutation activated = target.activate(
                activationKind,
                actor,
                now,
                transitionIdGenerator.nextTransitionId(),
                trigger,
                reason,
                closedRound == null ? null : closedRound.round().id());
        return changedPlan(closedRound, activated);
    }

    private SurveyRoundMutation closeCurrentIfPresent(
            Optional<SurveyRound> currentActiveRound,
            SurveyRoundId targetRoundId,
            SurveyActorId actor,
            Instant now,
            SurveyRoundTransitionTrigger trigger,
            String reason
    ) {
        if (currentActiveRound.isEmpty()) {
            return null;
        }
        return currentActiveRound.get()
                .closeForNextRound(
                        targetRoundId,
                        actor,
                        now,
                        transitionIdGenerator.nextTransitionId(),
                        trigger,
                        reason);
    }

    private SurveyRoundActivationPlan changedPlan(
            SurveyRoundMutation closedRound,
            SurveyRoundMutation activated
    ) {
        List<SurveyRoundTransition> transitions = new ArrayList<>();
        if (closedRound != null) {
            transitions.add(closedRound.transition().orElseThrow());
        }
        transitions.add(activated.transition().orElseThrow());
        return SurveyRoundActivationPlan.changed(
                activated.round(),
                closedRound == null ? null : closedRound.round(),
                transitions);
    }

    private static void validateCurrentActive(
            Optional<SurveyRound> currentActiveRound
    ) {
        Objects.requireNonNull(currentActiveRound, "currentActiveRound")
                .ifPresent(round -> {
                    if (round.status() != SurveyRoundStatus.ACTIVE) {
                        throw SurveyDomainException.invariant(
                                "SURVEY_ROUND_CURRENT_NOT_ACTIVE",
                                "currentActiveRound",
                                "current active round must have ACTIVE status");
                    }
                });
    }

    private static void validateActivationKind(
            Optional<SurveyRound> currentActiveRound,
            SurveyRoundActivationKind activationKind
    ) {
        Objects.requireNonNull(activationKind, "activationKind");
        if (currentActiveRound.isPresent()
                && activationKind == SurveyRoundActivationKind.FIRST) {
            throw SurveyDomainException.invariant(
                    "SURVEY_ROUND_FIRST_ACTIVATION_CONFLICT",
                    "activationKind",
                    "FIRST activation cannot replace an active round");
        }
    }
}
