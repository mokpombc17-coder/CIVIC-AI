package com.hamcheeze.vote.survey.domain.eligibility;

import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public final class ServiceEligibilityDecision {

    private final boolean eligible;
    private final SurveyRequirement surveyRequirement;
    private final ServiceEligibilityReason reason;
    private final ServiceEligibilityNextAction nextAction;
    private final SurveyRoundId activeRoundId;
    private final Instant evaluatedAt;
    private final Set<ServiceCapability> capabilities;

    private ServiceEligibilityDecision(
            boolean eligible,
            SurveyRequirement surveyRequirement,
            ServiceEligibilityReason reason,
            ServiceEligibilityNextAction nextAction,
            SurveyRoundId activeRoundId,
            Instant evaluatedAt,
            Set<ServiceCapability> capabilities
    ) {
        this.eligible = eligible;
        this.surveyRequirement = Objects.requireNonNull(
                surveyRequirement,
                "surveyRequirement");
        this.reason = reason;
        this.nextAction = nextAction;
        this.activeRoundId = activeRoundId;
        this.evaluatedAt = Objects.requireNonNull(evaluatedAt, "evaluatedAt");
        this.capabilities = Set.copyOf(Objects.requireNonNull(
                capabilities,
                "capabilities"));
        validateConsistency();
    }

    static ServiceEligibilityDecision satisfied(
            SurveyRoundId activeRoundId,
            Instant evaluatedAt,
            Set<ServiceCapability> capabilities
    ) {
        return new ServiceEligibilityDecision(
                true,
                SurveyRequirement.SATISFIED,
                null,
                null,
                activeRoundId,
                evaluatedAt,
                capabilities);
    }

    static ServiceEligibilityDecision recommended(
            SurveyRoundId activeRoundId,
            Instant evaluatedAt,
            Set<ServiceCapability> capabilities
    ) {
        return new ServiceEligibilityDecision(
                true,
                SurveyRequirement.RECOMMENDED,
                ServiceEligibilityReason.CURRENT_SURVEY_RESPONSE_RECOMMENDED,
                ServiceEligibilityNextAction.COMPLETE_CURRENT_SURVEY,
                activeRoundId,
                evaluatedAt,
                capabilities);
    }

    static ServiceEligibilityDecision required(
            SurveyRoundId activeRoundId,
            Instant evaluatedAt,
            Set<ServiceCapability> capabilities
    ) {
        return new ServiceEligibilityDecision(
                false,
                SurveyRequirement.REQUIRED,
                ServiceEligibilityReason.CURRENT_SURVEY_RESPONSE_REQUIRED,
                ServiceEligibilityNextAction.COMPLETE_CURRENT_SURVEY,
                activeRoundId,
                evaluatedAt,
                capabilities);
    }

    static ServiceEligibilityDecision unavailable(
            Instant evaluatedAt,
            Set<ServiceCapability> capabilities
    ) {
        return new ServiceEligibilityDecision(
                false,
                SurveyRequirement.UNAVAILABLE,
                ServiceEligibilityReason.ACTIVE_SURVEY_ROUND_UNAVAILABLE,
                null,
                null,
                evaluatedAt,
                capabilities);
    }

    public boolean eligible() {
        return eligible;
    }

    public SurveyRequirement surveyRequirement() {
        return surveyRequirement;
    }

    public Optional<ServiceEligibilityReason> reason() {
        return Optional.ofNullable(reason);
    }

    public Optional<ServiceEligibilityNextAction> nextAction() {
        return Optional.ofNullable(nextAction);
    }

    public Optional<SurveyRoundId> activeRoundId() {
        return Optional.ofNullable(activeRoundId);
    }

    public Instant evaluatedAt() {
        return evaluatedAt;
    }

    public Set<ServiceCapability> capabilities() {
        return capabilities;
    }

    public boolean can(ServiceCapability capability) {
        return capabilities.contains(Objects.requireNonNull(
                capability,
                "capability"));
    }

    private void validateConsistency() {
        boolean unavailable = surveyRequirement == SurveyRequirement.UNAVAILABLE;
        if (unavailable != (activeRoundId == null)) {
            throw new IllegalArgumentException(
                    "only UNAVAILABLE decision has no activeRoundId");
        }
        if (eligible != (surveyRequirement == SurveyRequirement.SATISFIED
                || surveyRequirement == SurveyRequirement.RECOMMENDED)) {
            throw new IllegalArgumentException(
                    "eligible value does not match surveyRequirement");
        }
    }
}
