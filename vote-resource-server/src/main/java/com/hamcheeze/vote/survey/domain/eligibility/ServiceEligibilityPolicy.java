package com.hamcheeze.vote.survey.domain.eligibility;

import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundEnforcementMode;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;

import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class ServiceEligibilityPolicy {

    private static final Set<ServiceCapability> SATISFIED_CAPABILITIES =
            immutableCapabilities(
                    ServiceCapability.USE_GENERAL_SERVICE,
                    ServiceCapability.VIEW_CURRENT_SURVEY,
                    ServiceCapability.VIEW_OWN_SURVEY_RESPONSES);

    private static final Set<ServiceCapability> RECOMMENDED_CAPABILITIES =
            immutableCapabilities(
                    ServiceCapability.USE_GENERAL_SERVICE,
                    ServiceCapability.VIEW_CURRENT_SURVEY,
                    ServiceCapability.SUBMIT_CURRENT_SURVEY,
                    ServiceCapability.VIEW_OWN_SURVEY_RESPONSES);

    private static final Set<ServiceCapability> REQUIRED_CAPABILITIES =
            immutableCapabilities(
                    ServiceCapability.VIEW_CURRENT_SURVEY,
                    ServiceCapability.SUBMIT_CURRENT_SURVEY,
                    ServiceCapability.VIEW_OWN_SURVEY_RESPONSES);

    private static final Set<ServiceCapability> UNAVAILABLE_CAPABILITIES =
            immutableCapabilities(
                    ServiceCapability.VIEW_OWN_SURVEY_RESPONSES);

    public ServiceEligibilityDecision evaluate(
            ServiceEligibilityContext context
    ) {
        Objects.requireNonNull(context, "context");
        List<SurveyRound> candidates = context.activeRoundCandidates();
        if (candidates.size() != 1
                || candidates.getFirst().status() != SurveyRoundStatus.ACTIVE) {
            return ServiceEligibilityDecision.unavailable(
                    context.evaluatedAt(),
                    UNAVAILABLE_CAPABILITIES);
        }

        SurveyRound activeRound = candidates.getFirst();
        if (context.hasCurrentRoundResponse()) {
            return ServiceEligibilityDecision.satisfied(
                    activeRound.id(),
                    context.evaluatedAt(),
                    SATISFIED_CAPABILITIES);
        }
        if (!context.hasResponseBeforeCurrentRound()) {
            return ServiceEligibilityDecision.required(
                    activeRound.id(),
                    context.evaluatedAt(),
                    REQUIRED_CAPABILITIES);
        }
        SurveyRoundEnforcementMode enforcementMode =
                activeRound.enforcementMode().orElseThrow();
        if (enforcementMode == SurveyRoundEnforcementMode.ADVISORY) {
            return ServiceEligibilityDecision.recommended(
                    activeRound.id(),
                    context.evaluatedAt(),
                    RECOMMENDED_CAPABILITIES);
        }
        return ServiceEligibilityDecision.required(
                activeRound.id(),
                context.evaluatedAt(),
                REQUIRED_CAPABILITIES);
    }

    private static Set<ServiceCapability> immutableCapabilities(
            ServiceCapability first,
            ServiceCapability... rest
    ) {
        EnumSet<ServiceCapability> values = EnumSet.of(first, rest);
        return Set.copyOf(values);
    }
}
