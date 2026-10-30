package com.hamcheeze.vote.survey.domain.round;

import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.NOW;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.actorId;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.draftContent;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.publishedContent;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.roundId;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.roundNumber;
import static com.hamcheeze.vote.survey.domain.round.SurveyRoundTestFixtures.transitionId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyRoundTest {

    @Test
    void schedulesPublishedContentInFutureWithHistory() {
        Instant scheduledAt = NOW.plusSeconds(3_600);

        SurveyRoundMutation result = SurveyRound.schedule(
                roundId(1),
                roundNumber(1),
                publishedContent(),
                scheduledAt,
                actorId(),
                NOW.plusSeconds(2),
                transitionId(1),
                "첫 예약");

        assertThat(result.changed()).isTrue();
        assertThat(result.round().status())
                .isEqualTo(SurveyRoundStatus.SCHEDULED);
        assertThat(result.round().scheduledAt()).contains(scheduledAt);
        assertThat(result.round().enforcementMode()).isEmpty();
        assertThat(result.transition().orElseThrow().type())
                .isEqualTo(SurveyRoundTransitionType.SCHEDULED);
        assertThat(result.transition().orElseThrow().contentVersionId())
                .isEqualTo(publishedContent().id());
    }

    @Test
    void rejectsDraftContentAndNonFutureSchedule() {
        assertThatThrownBy(() -> SurveyRound.schedule(
                roundId(1),
                roundNumber(1),
                draftContent(),
                NOW.plusSeconds(60),
                actorId(),
                NOW,
                transitionId(1),
                null))
                .isInstanceOf(SurveyDomainException.class);

        assertThatThrownBy(() -> SurveyRound.schedule(
                roundId(1),
                roundNumber(1),
                publishedContent(),
                NOW,
                actorId(),
                NOW,
                transitionId(1),
                null))
                .isInstanceOf(SurveyDomainException.class);
    }

    @Test
    void reschedulesOnlyScheduledRoundAndKeepsHistory() {
        SurveyRound scheduled = scheduledRound();
        Instant changedAt = NOW.plusSeconds(20);
        Instant newScheduledAt = NOW.plusSeconds(7_200);

        SurveyRoundMutation result = scheduled.reschedule(
                newScheduledAt,
                actorId(),
                changedAt,
                transitionId(2),
                "시간 변경");

        assertThat(result.round().scheduledAt()).contains(newScheduledAt);
        assertThat(result.transition().orElseThrow().type())
                .isEqualTo(SurveyRoundTransitionType.RESCHEDULED);
        assertThat(result.transition().orElseThrow().previousScheduledAt())
                .isEqualTo(scheduled.scheduledAt());
        assertThat(result.transition().orElseThrow().newScheduledAt())
                .contains(newScheduledAt);

        SurveyRoundMutation sameTime = result.round().reschedule(
                newScheduledAt,
                actorId(),
                changedAt,
                transitionId(3),
                null);
        assertThat(sameTime.changed()).isFalse();
        assertThat(sameTime.transition()).isEmpty();
    }

    @Test
    void cancelsScheduledRoundAndMakesItTerminal() {
        SurveyRoundMutation canceled = scheduledRound().cancel(
                actorId(),
                NOW.plusSeconds(30),
                transitionId(2),
                "계획 변경");

        assertThat(canceled.round().status())
                .isEqualTo(SurveyRoundStatus.CANCELED);
        assertThat(canceled.round().canceledAt())
                .contains(NOW.plusSeconds(30));
        assertThat(canceled.transition().orElseThrow().type())
                .isEqualTo(SurveyRoundTransitionType.CANCELED);
        assertThatThrownBy(() -> canceled.round().reschedule(
                NOW.plusSeconds(7_200),
                actorId(),
                NOW.plusSeconds(40),
                transitionId(3),
                null))
                .isInstanceOf(SurveyDomainException.class);
    }

    @Test
    void changesEnforcementOnlyForActiveRoundWithReason() {
        SurveyRound active = activeRound(
                SurveyRoundEnforcementMode.ADVISORY);

        SurveyRoundMutation required = active.requireResponses(
                actorId(),
                NOW.plusSeconds(20),
                transitionId(2),
                "응답 기간 안내 완료");

        assertThat(required.round().enforcementMode())
                .contains(SurveyRoundEnforcementMode.REQUIRED);
        assertThat(required.transition().orElseThrow().type())
                .isEqualTo(
                        SurveyRoundTransitionType.ENFORCEMENT_REQUIRED);
        assertThat(required.transition().orElseThrow().reason())
                .contains("응답 기간 안내 완료");

        assertThatThrownBy(() -> active.requireResponses(
                actorId(),
                NOW.plusSeconds(20),
                transitionId(3),
                " "))
                .isInstanceOf(SurveyDomainException.class);
    }

    @Test
    void sameEnforcementIsSuccessfulNoOpWithoutHistory() {
        SurveyRound active = activeRound(
                SurveyRoundEnforcementMode.REQUIRED);

        SurveyRoundMutation result = active.requireResponses(
                actorId(),
                NOW.plusSeconds(20),
                transitionId(2),
                null);

        assertThat(result.changed()).isFalse();
        assertThat(result.round()).isSameAs(active);
        assertThat(result.transition()).isEmpty();
    }

    @Test
    void relaxesRequirementOnlyWithOperationalReason() {
        SurveyRound active = activeRound(
                SurveyRoundEnforcementMode.REQUIRED);

        SurveyRoundMutation relaxed = active.relaxRequirement(
                new SurveyActorId("operations-admin"),
                NOW.plusSeconds(20),
                transitionId(2),
                "설문 장애 복구");

        assertThat(relaxed.round().enforcementMode())
                .contains(SurveyRoundEnforcementMode.ADVISORY);
        assertThat(relaxed.transition().orElseThrow().type())
                .isEqualTo(
                        SurveyRoundTransitionType.ENFORCEMENT_RELAXED);
    }

    @Test
    void rejectsStateDependentFieldMismatchOnRehydrate() {
        assertThatThrownBy(() -> SurveyRound.rehydrate(
                roundId(1),
                new SurveyRoundNumber(1),
                publishedContent().id(),
                SurveyRoundStatus.ACTIVE,
                null,
                null,
                NOW.plusSeconds(10),
                null,
                null,
                null,
                actorId(),
                NOW,
                0))
                .isInstanceOf(SurveyDomainException.class)
                .hasMessageContaining("enforcementMode");
    }

    @Test
    void limitsOptionalTransitionReasonToFiveHundredCodePoints() {
        assertThatThrownBy(() -> scheduledRound().cancel(
                actorId(),
                NOW.plusSeconds(20),
                transitionId(2),
                "😀".repeat(501)))
                .isInstanceOf(SurveyDomainException.class);
    }

    private static SurveyRound scheduledRound() {
        return SurveyRound.schedule(
                        roundId(1),
                        roundNumber(1),
                        publishedContent(),
                        NOW.plusSeconds(3_600),
                        actorId(),
                        NOW.plusSeconds(2),
                        transitionId(1),
                        null)
                .round();
    }

    private static SurveyRound activeRound(
            SurveyRoundEnforcementMode enforcementMode
    ) {
        return SurveyRound.rehydrate(
                roundId(1),
                roundNumber(1),
                publishedContent().id(),
                SurveyRoundStatus.ACTIVE,
                enforcementMode,
                null,
                NOW.plusSeconds(10),
                null,
                null,
                null,
                actorId(),
                NOW,
                0);
    }
}
