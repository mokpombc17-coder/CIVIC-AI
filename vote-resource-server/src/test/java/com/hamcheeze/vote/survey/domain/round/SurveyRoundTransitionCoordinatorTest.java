package com.hamcheeze.vote.survey.domain.round;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.NOW;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.actorId;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.publishedContent;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.roundId;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.roundNumber;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.transitionIdGenerator;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyRoundTransitionCoordinatorTest {

    private SurveyRoundTransitionCoordinator coordinator;

    @BeforeEach
    void setUp() {
        coordinator = new SurveyRoundTransitionCoordinator(
                transitionIdGenerator());
    }

    @Test
    void allowsOnlyOneScheduledRound() {
        SurveyRound existing = scheduledRound(1);

        assertThatThrownBy(() -> coordinator.schedule(
                Optional.of(existing),
                roundId(2),
                roundNumber(2),
                publishedContent(),
                NOW.plusSeconds(7_200),
                actorId(),
                NOW.plusSeconds(10),
                null))
                .isInstanceOf(SurveyDomainException.class)
                .hasMessageContaining("only one scheduled round");
    }

    @Test
    void startsFirstRoundAsRequiredWithLocalBootstrapHistory() {
        SurveyRoundActivationPlan plan = coordinator.startPublishedContentNow(
                Optional.empty(),
                Optional.empty(),
                roundId(1),
                roundNumber(1),
                publishedContent(),
                SurveyRoundActivationKind.FIRST,
                actorId(),
                NOW.plusSeconds(10),
                SurveyRoundTransitionTrigger.LOCAL_BOOTSTRAP,
                null);

        assertThat(plan.changed()).isTrue();
        assertThat(plan.closedRound()).isEmpty();
        assertThat(plan.targetRound().status())
                .isEqualTo(SurveyRoundStatus.ACTIVE);
        assertThat(plan.targetRound().enforcementMode())
                .contains(SurveyRoundEnforcementMode.REQUIRED);
        assertThat(plan.transitions())
                .extracting(SurveyRoundTransition::type)
                .containsExactly(SurveyRoundTransitionType.ACTIVATED);
        assertThat(plan.transitions().getFirst().trigger())
                .isEqualTo(SurveyRoundTransitionTrigger.LOCAL_BOOTSTRAP);
    }

    @Test
    void startsSubsequentRoundAdvisoryAndClosesCurrentAtomically() {
        SurveyRound current = firstActiveRound();

        SurveyRoundActivationPlan plan = coordinator.startPublishedContentNow(
                Optional.of(current),
                Optional.empty(),
                roundId(2),
                roundNumber(2),
                publishedContent(),
                SurveyRoundActivationKind.SUBSEQUENT,
                new SurveyActorId("round-admin"),
                NOW.plusSeconds(20),
                SurveyRoundTransitionTrigger.ADMIN_START_NOW,
                "2회차 시작");

        assertThat(plan.closedRound()).isPresent();
        assertThat(plan.closedRound().orElseThrow().status())
                .isEqualTo(SurveyRoundStatus.CLOSED);
        assertThat(plan.closedRound().orElseThrow().closedByRoundId())
                .contains(roundId(2));
        assertThat(plan.targetRound().enforcementMode())
                .contains(SurveyRoundEnforcementMode.ADVISORY);
        assertThat(plan.transitions())
                .extracting(SurveyRoundTransition::type)
                .containsExactly(
                        SurveyRoundTransitionType.CLOSED,
                        SurveyRoundTransitionType.ACTIVATED);
        assertThat(plan.transitions().get(1).relatedRoundId())
                .contains(current.id());
    }

    @Test
    void scheduledRoundCanStartNowBeforeItsPlannedTime() {
        SurveyRound scheduled = scheduledRound(2);

        SurveyRoundActivationPlan plan = coordinator.startScheduledRoundNow(
                Optional.of(firstActiveRound()),
                scheduled,
                SurveyRoundActivationKind.SUBSEQUENT,
                actorId(),
                NOW.plusSeconds(20),
                "관리자 즉시 시작");

        assertThat(plan.targetRound().status())
                .isEqualTo(SurveyRoundStatus.ACTIVE);
        assertThat(plan.targetRound().scheduledAt())
                .isEqualTo(scheduled.scheduledAt());
        assertThat(plan.targetRound().activatedAt())
                .contains(NOW.plusSeconds(20));
    }

    @Test
    void schedulerActivatesOnlyWhenReservationIsDue() {
        SurveyRound scheduled = scheduledRound(2);

        SurveyRoundActivationPlan early = coordinator.activateDueRound(
                Optional.of(firstActiveRound()),
                scheduled,
                SurveyRoundActivationKind.SUBSEQUENT,
                new SurveyActorId("system:survey-scheduler"),
                NOW.plusSeconds(100),
                SurveyRoundTransitionTrigger.SCHEDULER);
        assertThat(early.changed()).isFalse();

        SurveyRoundActivationPlan due = coordinator.activateDueRound(
                Optional.of(firstActiveRound()),
                scheduled,
                SurveyRoundActivationKind.SUBSEQUENT,
                new SurveyActorId("system:survey-scheduler"),
                NOW.plusSeconds(3_600),
                SurveyRoundTransitionTrigger.SCHEDULER);
        assertThat(due.changed()).isTrue();
        assertThat(due.targetRound().activatedAt())
                .contains(NOW.plusSeconds(3_600));
    }

    @Test
    void repeatedSchedulerAttemptDoesNotDuplicateActivationHistory() {
        SurveyRound activeTarget = SurveyRound.rehydrate(
                roundId(2),
                roundNumber(2),
                publishedContent().id(),
                SurveyRoundStatus.ACTIVE,
                SurveyRoundEnforcementMode.ADVISORY,
                NOW.plusSeconds(3_600),
                NOW.plusSeconds(3_605),
                null,
                null,
                null,
                actorId(),
                NOW,
                1);

        SurveyRoundActivationPlan repeated = coordinator.activateDueRound(
                Optional.of(activeTarget),
                activeTarget,
                SurveyRoundActivationKind.SUBSEQUENT,
                new SurveyActorId("system:survey-scheduler"),
                NOW.plusSeconds(3_610),
                SurveyRoundTransitionTrigger.SCHEDULER);

        assertThat(repeated.changed()).isFalse();
        assertThat(repeated.transitions()).isEmpty();
    }

    @Test
    void schedulerIgnoresCanceledRound() {
        SurveyRound canceled = scheduledRound(2)
                .cancel(
                        actorId(),
                        NOW.plusSeconds(20),
                        SurveyRoundTestFixtures.transitionId(20),
                        null)
                .round();

        SurveyRoundActivationPlan result = coordinator.activateDueRound(
                Optional.of(firstActiveRound()),
                canceled,
                SurveyRoundActivationKind.SUBSEQUENT,
                new SurveyActorId("system:survey-scheduler"),
                NOW.plusSeconds(4_000),
                SurveyRoundTransitionTrigger.SCHEDULER_RECOVERY);

        assertThat(result.changed()).isFalse();
        assertThat(result.targetRound().status())
                .isEqualTo(SurveyRoundStatus.CANCELED);
    }

    @Test
    void scheduledRoundBlocksDifferentImmediateStart() {
        assertThatThrownBy(() -> coordinator.startPublishedContentNow(
                Optional.of(firstActiveRound()),
                Optional.of(scheduledRound(2)),
                roundId(3),
                roundNumber(3),
                publishedContent(),
                SurveyRoundActivationKind.SUBSEQUENT,
                actorId(),
                NOW.plusSeconds(20),
                SurveyRoundTransitionTrigger.ADMIN_START_NOW,
                null))
                .isInstanceOf(SurveyDomainException.class)
                .hasMessageContaining("cancel or start");
    }

    @Test
    void firstActivationCannotReplaceExistingActiveRound() {
        assertThatThrownBy(() -> coordinator.startPublishedContentNow(
                Optional.of(firstActiveRound()),
                Optional.empty(),
                roundId(2),
                roundNumber(2),
                publishedContent(),
                SurveyRoundActivationKind.FIRST,
                actorId(),
                NOW.plusSeconds(20),
                SurveyRoundTransitionTrigger.ADMIN_START_NOW,
                null))
                .isInstanceOf(SurveyDomainException.class);
    }

    private SurveyRound firstActiveRound() {
        return coordinator.startPublishedContentNow(
                        Optional.empty(),
                        Optional.empty(),
                        roundId(1),
                        roundNumber(1),
                        publishedContent(),
                        SurveyRoundActivationKind.FIRST,
                        actorId(),
                        NOW.plusSeconds(10),
                        SurveyRoundTransitionTrigger.LOCAL_BOOTSTRAP,
                        null)
                .targetRound();
    }

    private SurveyRound scheduledRound(int number) {
        Instant scheduledAt = NOW.plusSeconds(3_600);
        return coordinator.schedule(
                        Optional.empty(),
                        roundId(number),
                        roundNumber(number),
                        publishedContent(),
                        scheduledAt,
                        actorId(),
                        NOW.plusSeconds(5),
                        null)
                .round();
    }
}
