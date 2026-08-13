package com.hamcheeze.vote.survey.domain.eligibility;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static com.hamcheeze.vote.survey.SurveyTestFixtures.NOW;
import static com.hamcheeze.vote.survey.SurveyTestFixtures.actorId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ServiceEligibilityPolicyTest {

    private final ServiceEligibilityPolicy policy =
            new ServiceEligibilityPolicy();

    @ParameterizedTest
    @MethodSource("normalDecisionCases")
    void followsEligibilityDecisionTable(
            boolean currentResponse,
            boolean pastResponse,
            SurveyRoundEnforcementMode enforcementMode,
            SurveyRequirement expectedRequirement,
            boolean expectedEligible
    ) {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(activeRound(3, enforcementMode)),
                currentResponse,
                pastResponse));

        assertThat(decision.surveyRequirement())
                .isEqualTo(expectedRequirement);
        assertThat(decision.eligible()).isEqualTo(expectedEligible);
        assertThat(decision.activeRoundId()).contains(roundId(3));
        assertThat(decision.evaluatedAt()).isEqualTo(NOW);
    }

    static Stream<Arguments> normalDecisionCases() {
        return Stream.of(
                Arguments.of(
                        true, false, SurveyRoundEnforcementMode.ADVISORY,
                        SurveyRequirement.SATISFIED, true),
                Arguments.of(
                        true, true, SurveyRoundEnforcementMode.REQUIRED,
                        SurveyRequirement.SATISFIED, true),
                Arguments.of(
                        false, false, SurveyRoundEnforcementMode.ADVISORY,
                        SurveyRequirement.REQUIRED, false),
                Arguments.of(
                        false, false, SurveyRoundEnforcementMode.REQUIRED,
                        SurveyRequirement.REQUIRED, false),
                Arguments.of(
                        false, true, SurveyRoundEnforcementMode.ADVISORY,
                        SurveyRequirement.RECOMMENDED, true),
                Arguments.of(
                        false, true, SurveyRoundEnforcementMode.REQUIRED,
                        SurveyRequirement.REQUIRED, false));
    }

    @Test
    void satisfiedUserCanUseGeneralServiceButCannotResubmit() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(activeRound(1, SurveyRoundEnforcementMode.REQUIRED)),
                true,
                false));

        assertThat(decision.capabilities()).containsExactlyInAnyOrder(
                ServiceCapability.USE_GENERAL_SERVICE,
                ServiceCapability.VIEW_CURRENT_SURVEY,
                ServiceCapability.VIEW_OWN_SURVEY_RESPONSES);
        assertThat(decision.can(ServiceCapability.SUBMIT_CURRENT_SURVEY))
                .isFalse();
        assertThat(decision.reason()).isEmpty();
        assertThat(decision.nextAction()).isEmpty();
    }

    @Test
    void recommendedUserCanUseServiceAndSubmitCurrentSurvey() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(activeRound(2, SurveyRoundEnforcementMode.ADVISORY)),
                false,
                true));

        assertThat(decision.capabilities())
                .containsExactlyInAnyOrder(ServiceCapability.values());
        assertThat(decision.reason()).contains(
                ServiceEligibilityReason.CURRENT_SURVEY_RESPONSE_RECOMMENDED);
        assertThat(decision.nextAction()).contains(
                ServiceEligibilityNextAction.COMPLETE_CURRENT_SURVEY);
    }

    @Test
    void requiredUserKeepsSurveyAndOwnResponseCapabilitiesOnly() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(activeRound(2, SurveyRoundEnforcementMode.REQUIRED)),
                false,
                true));

        assertThat(decision.can(ServiceCapability.USE_GENERAL_SERVICE))
                .isFalse();
        assertThat(decision.capabilities()).containsExactlyInAnyOrder(
                ServiceCapability.VIEW_CURRENT_SURVEY,
                ServiceCapability.SUBMIT_CURRENT_SURVEY,
                ServiceCapability.VIEW_OWN_SURVEY_RESPONSES);
        assertThat(decision.reason()).contains(
                ServiceEligibilityReason.CURRENT_SURVEY_RESPONSE_REQUIRED);
    }

    @Test
    void systemRoundTwoStillActsAsFirstSurveyForNewUser() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(activeRound(2, SurveyRoundEnforcementMode.ADVISORY)),
                false,
                false));

        assertThat(decision.surveyRequirement())
                .isEqualTo(SurveyRequirement.REQUIRED);
        assertThat(decision.eligible()).isFalse();
    }

    @Test
    void ignoresMissedPastRoundsAndUsesOnlyPastResponseExistence() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(activeRound(5, SurveyRoundEnforcementMode.ADVISORY)),
                false,
                true));

        assertThat(decision.surveyRequirement())
                .isEqualTo(SurveyRequirement.RECOMMENDED);
        assertThat(decision.eligible()).isTrue();
    }

    @Test
    void differentUserIdIsEvaluatedWithItsOwnResponseFacts() {
        SurveyRound activeRound = activeRound(
                2,
                SurveyRoundEnforcementMode.ADVISORY);
        ServiceEligibilityDecision withdrawnUser = policy.evaluate(
                new ServiceEligibilityContext(
                        new SurveyUserId("withdrawn-user"),
                        List.of(activeRound),
                        false,
                        true,
                        NOW));
        ServiceEligibilityDecision rejoinedUser = policy.evaluate(
                new ServiceEligibilityContext(
                        new SurveyUserId("rejoined-user"),
                        List.of(activeRound),
                        false,
                        false,
                        NOW));

        assertThat(withdrawnUser.surveyRequirement())
                .isEqualTo(SurveyRequirement.RECOMMENDED);
        assertThat(rejoinedUser.surveyRequirement())
                .isEqualTo(SurveyRequirement.REQUIRED);
    }

    @Test
    void protectsGeneralAndSurveyOperationsWhenActiveRoundIsMissing() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(),
                false,
                false));

        assertUnavailable(decision);
    }

    @Test
    void protectsWhenMultipleActiveRoundsAreReported() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(
                        activeRound(2, SurveyRoundEnforcementMode.ADVISORY),
                        activeRound(3, SurveyRoundEnforcementMode.REQUIRED)),
                true,
                true));

        assertUnavailable(decision);
    }

    @Test
    void protectsWhenReportedCandidateIsNotActive() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(closedRound()),
                true,
                true));

        assertUnavailable(decision);
    }

    @Test
    void appliesCommittedEnforcementSnapshotOnNextEvaluation() {
        ServiceEligibilityContext advisorySnapshot = context(
                List.of(activeRound(3, SurveyRoundEnforcementMode.ADVISORY)),
                false,
                true);
        ServiceEligibilityContext requiredSnapshot = context(
                List.of(activeRound(3, SurveyRoundEnforcementMode.REQUIRED)),
                false,
                true);

        assertThat(policy.evaluate(advisorySnapshot).surveyRequirement())
                .isEqualTo(SurveyRequirement.RECOMMENDED);
        assertThat(policy.evaluate(requiredSnapshot).surveyRequirement())
                .isEqualTo(SurveyRequirement.REQUIRED);
    }

    @Test
    void decisionCapabilitiesAreImmutable() {
        ServiceEligibilityDecision decision = policy.evaluate(context(
                List.of(activeRound(1, SurveyRoundEnforcementMode.REQUIRED)),
                true,
                false));

        assertThatThrownBy(() -> decision.capabilities().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    private static void assertUnavailable(
            ServiceEligibilityDecision decision
    ) {
        assertThat(decision.surveyRequirement())
                .isEqualTo(SurveyRequirement.UNAVAILABLE);
        assertThat(decision.eligible()).isFalse();
        assertThat(decision.activeRoundId()).isEmpty();
        assertThat(decision.reason()).contains(
                ServiceEligibilityReason.ACTIVE_SURVEY_ROUND_UNAVAILABLE);
        assertThat(decision.nextAction()).isEmpty();
        assertThat(decision.capabilities()).containsExactly(
                ServiceCapability.VIEW_OWN_SURVEY_RESPONSES);
    }

    private static ServiceEligibilityContext context(
            List<SurveyRound> activeRounds,
            boolean currentResponse,
            boolean pastResponse
    ) {
        return new ServiceEligibilityContext(
                new SurveyUserId("user-a"),
                activeRounds,
                currentResponse,
                pastResponse,
                NOW);
    }

    private static SurveyRound activeRound(
            int roundNumber,
            SurveyRoundEnforcementMode enforcementMode
    ) {
        return SurveyRound.rehydrate(
                roundId(roundNumber),
                new SurveyRoundNumber(roundNumber),
                contentVersionId(),
                SurveyRoundStatus.ACTIVE,
                enforcementMode,
                null,
                NOW.minusSeconds(60),
                null,
                null,
                null,
                actorId(),
                NOW.minusSeconds(120),
                0);
    }

    private static SurveyRound closedRound() {
        return SurveyRound.rehydrate(
                roundId(1),
                new SurveyRoundNumber(1),
                contentVersionId(),
                SurveyRoundStatus.CLOSED,
                SurveyRoundEnforcementMode.REQUIRED,
                null,
                NOW.minusSeconds(120),
                NOW.minusSeconds(60),
                null,
                roundId(2),
                actorId(),
                NOW.minusSeconds(180),
                0);
    }

    private static SurveyRoundId roundId(int roundNumber) {
        return new SurveyRoundId(new UUID(100, roundNumber));
    }

    private static SurveyContentVersionId contentVersionId() {
        return new SurveyContentVersionId(new UUID(101, 1));
    }
}
