package com.hamcheeze.vote.survey.application.round;

import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundTransitionId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundActivationKind;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundActivationPlan;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundMutation;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransition;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionCoordinator;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundTransitionTrigger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class SurveyRoundService {

    private final SurveyRoundRepository rounds;
    private final SurveyContentVersionRepository contents;
    private final SurveyRoundTransitionCoordinator coordinator;
    private final Clock clock;

    @Autowired
    public SurveyRoundService(
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents
    ) {
        this(rounds, contents, Clock.systemUTC());
    }

    SurveyRoundService(
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents,
            Clock clock
    ) {
        this.rounds = Objects.requireNonNull(rounds, "rounds");
        this.contents = Objects.requireNonNull(contents, "contents");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.coordinator = new SurveyRoundTransitionCoordinator(
                () -> new SurveyRoundTransitionId(UUID.randomUUID()));
    }

    @Transactional
    public SurveyRoundMutation schedule(
            SurveyContentVersionId contentVersionId,
            Instant scheduledAt,
            String reason,
            SurveyActorId actor
    ) {
        lockControl();
        LockedRounds locked = lockCurrentRounds();
        SurveyContentVersion content = requireContent(contentVersionId);
        SurveyRoundMutation mutation = coordinator.schedule(
                locked.scheduled(),
                new SurveyRoundId(UUID.randomUUID()),
                nextRoundNumber(),
                content,
                scheduledAt,
                actor,
                clock.instant(),
                reason);
        save(mutation);
        return mutation;
    }

    @Transactional
    public SurveyRoundMutation reschedule(
            SurveyRoundId roundId,
            Instant scheduledAt,
            String reason,
            SurveyActorId actor
    ) {
        lockControl();
        SurveyRound round = lockRound(roundId);
        SurveyRoundMutation mutation = round.reschedule(
                scheduledAt,
                actor,
                clock.instant(),
                new SurveyRoundTransitionId(UUID.randomUUID()),
                reason);
        save(mutation);
        return mutation;
    }

    @Transactional
    public SurveyRoundMutation cancel(
            SurveyRoundId roundId,
            String reason,
            SurveyActorId actor
    ) {
        lockControl();
        SurveyRound round = lockRound(roundId);
        SurveyRoundMutation mutation = round.cancel(
                actor,
                clock.instant(),
                new SurveyRoundTransitionId(UUID.randomUUID()),
                reason);
        save(mutation);
        return mutation;
    }

    @Transactional
    public SurveyRoundActivationPlan startPublishedContentNow(
            SurveyContentVersionId contentVersionId,
            String reason,
            SurveyActorId actor
    ) {
        lockControl();
        LockedRounds locked = lockCurrentRounds();
        SurveyContentVersion content = requireContent(contentVersionId);
        SurveyRoundActivationPlan plan = coordinator.startPublishedContentNow(
                locked.active(),
                locked.scheduled(),
                new SurveyRoundId(UUID.randomUUID()),
                nextRoundNumber(),
                content,
                activationKind(locked.active()),
                actor,
                clock.instant(),
                SurveyRoundTransitionTrigger.ADMIN_START_NOW,
                reason);
        save(plan);
        return plan;
    }

    @Transactional
    public SurveyRoundActivationPlan startScheduledRoundNow(
            SurveyRoundId roundId,
            String reason,
            SurveyActorId actor
    ) {
        lockControl();
        LockedRounds locked = lockCurrentRoundsIncluding(roundId);
        SurveyRound target = locked.require(roundId);
        SurveyRoundActivationPlan plan = coordinator.startScheduledRoundNow(
                locked.activeExcluding(roundId),
                target,
                activationKind(locked.activeExcluding(roundId)),
                actor,
                clock.instant(),
                reason);
        save(plan);
        return plan;
    }

    @Transactional
    public SurveyRoundActivationPlan activateDueRound(
            SurveyRoundId roundId,
            SurveyActorId actor
    ) {
        lockControl();
        LockedRounds locked = lockCurrentRoundsIncluding(roundId);
        SurveyRound target = locked.require(roundId);
        Optional<SurveyRound> active = locked.activeExcluding(roundId);
        SurveyRoundActivationPlan plan = coordinator.activateDueRound(
                active,
                target,
                activationKind(active),
                actor,
                clock.instant(),
                SurveyRoundTransitionTrigger.SCHEDULER);
        save(plan);
        return plan;
    }

    @Transactional
    public SurveyRoundMutation changeEnforcement(
            SurveyRoundId roundId,
            SurveyRoundEnforcementMode mode,
            String reason,
            SurveyActorId actor
    ) {
        lockControl();
        SurveyRound round = lockRound(roundId);
        Instant now = clock.instant();
        SurveyRoundTransitionId transitionId =
                new SurveyRoundTransitionId(UUID.randomUUID());
        SurveyRoundMutation mutation = mode
                == SurveyRoundEnforcementMode.REQUIRED
                ? round.requireResponses(actor, now, transitionId, reason)
                : round.relaxRequirement(actor, now, transitionId, reason);
        save(mutation);
        return mutation;
    }

    @Transactional(readOnly = true)
    public List<SurveyRound> findAll() {
        return rounds.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<SurveyRound> findById(SurveyRoundId roundId) {
        return rounds.findById(roundId);
    }

    @Transactional(readOnly = true)
    public List<SurveyRoundTransition> findTransitions(
            SurveyRoundId roundId
    ) {
        return rounds.findTransitions(roundId);
    }

    @Transactional(readOnly = true)
    public List<SurveyRound> findDueRounds() {
        return rounds.findScheduledDueAt(clock.instant());
    }

    private void lockControl() {
        rounds.lockGlobalControlForUpdate();
    }

    private LockedRounds lockCurrentRounds() {
        List<SurveyRoundId> ids = new ArrayList<>();
        rounds.findActive().map(SurveyRound::id).ifPresent(ids::add);
        rounds.findScheduled().map(SurveyRound::id).ifPresent(ids::add);
        return new LockedRounds(rounds.findByIdsForUpdate(ids));
    }

    private LockedRounds lockCurrentRoundsIncluding(SurveyRoundId roundId) {
        List<SurveyRoundId> ids = new ArrayList<>();
        ids.add(Objects.requireNonNull(roundId, "roundId"));
        rounds.findActive().map(SurveyRound::id).ifPresent(ids::add);
        rounds.findScheduled().map(SurveyRound::id).ifPresent(ids::add);
        return new LockedRounds(rounds.findByIdsForUpdate(ids));
    }

    private SurveyRound lockRound(SurveyRoundId roundId) {
        return lockCurrentRoundsIncluding(roundId).require(roundId);
    }

    private SurveyContentVersion requireContent(
            SurveyContentVersionId contentVersionId
    ) {
        return contents.findById(contentVersionId)
                .orElseThrow(() -> SurveyDomainException.invariant(
                        "SURVEY_CONTENT_NOT_FOUND",
                        "contentVersionId",
                        "survey content version does not exist"));
    }

    private SurveyRoundNumber nextRoundNumber() {
        int highest = rounds.findAll().stream()
                .map(SurveyRound::roundNumber)
                .mapToInt(SurveyRoundNumber::value)
                .max()
                .orElse(0);
        return new SurveyRoundNumber(Math.addExact(highest, 1));
    }

    private static SurveyRoundActivationKind activationKind(
            Optional<SurveyRound> active
    ) {
        return active.isPresent()
                ? SurveyRoundActivationKind.SUBSEQUENT
                : SurveyRoundActivationKind.FIRST;
    }

    private void save(SurveyRoundMutation mutation) {
        if (!mutation.changed()) {
            return;
        }
        rounds.save(mutation.round());
        rounds.appendTransitions(List.of(
                mutation.transition().orElseThrow()));
    }

    private void save(SurveyRoundActivationPlan plan) {
        if (!plan.changed()) {
            return;
        }
        plan.closedRound().ifPresent(rounds::save);
        rounds.save(plan.targetRound());
        rounds.appendTransitions(plan.transitions());
    }

    private record LockedRounds(List<SurveyRound> values) {

        private LockedRounds {
            values = List.copyOf(values);
        }

        Optional<SurveyRound> active() {
            return byStatus(SurveyRoundStatus.ACTIVE);
        }

        Optional<SurveyRound> scheduled() {
            return byStatus(SurveyRoundStatus.SCHEDULED);
        }

        Optional<SurveyRound> activeExcluding(SurveyRoundId roundId) {
            return values.stream()
                    .filter(round -> round.status() == SurveyRoundStatus.ACTIVE)
                    .filter(round -> !round.id().equals(roundId))
                    .findFirst();
        }

        SurveyRound require(SurveyRoundId roundId) {
            return values.stream()
                    .filter(round -> round.id().equals(roundId))
                    .findFirst()
                    .orElseThrow(() -> SurveyDomainException.invariant(
                            "SURVEY_ROUND_NOT_FOUND",
                            "roundId",
                            "survey round does not exist"));
        }

        private Optional<SurveyRound> byStatus(SurveyRoundStatus status) {
            return values.stream()
                    .filter(round -> round.status() == status)
                    .findFirst();
        }
    }
}
