package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.application.preview.SurveyPreviewMode;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceCapability;
import com.hamcheeze.vote.survey.domain.eligibility.ServiceEligibilityDecision;
import com.hamcheeze.vote.survey.domain.eligibility.SurveyRequirement;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Component
@Profile({"local", "dev"})
final class LocalSurveyEligibilityFixture {

    private final SurveyPreviewMode previewMode;
    private final List<String> bypassSubjectPrefixes;

    LocalSurveyEligibilityFixture(
            SurveyPreviewMode previewMode,
            @Value("${vote.survey.eligibility-bypass.subject-prefixes:}")
            String configuredBypassSubjectPrefixes
    ) {
        this.previewMode = Objects.requireNonNull(previewMode, "previewMode");
        this.bypassSubjectPrefixes = Arrays.stream(Objects.requireNonNull(
                        configuredBypassSubjectPrefixes,
                        "configuredBypassSubjectPrefixes").split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .toList();
    }

    Optional<SurveyApiModels.EligibilityResponse> responseFor(
            SurveyUserId userId,
            ServiceEligibilityDecision evaluated
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(evaluated, "evaluated");
        if (bypassSubjectPrefixes.stream()
                .anyMatch(userId.value()::startsWith)) {
            // Local e2e users skip the survey gate without touching state.
            return Optional.of(new SurveyApiModels.EligibilityResponse(
                    true,
                    null,
                    null,
                    null,
                    null,
                    evaluated.evaluatedAt(),
                    List.of()));
        }
        if (!previewMode.enabledFor(userId)) {
            return Optional.empty();
        }
        return Optional.of(new SurveyApiModels.EligibilityResponse(
                true,
                SurveyRequirement.SATISFIED.name(),
                null,
                null,
                evaluated.activeRoundId()
                        .map(value -> value.value())
                        .orElse(null),
                evaluated.evaluatedAt(),
                List.of(ServiceCapability.USE_GENERAL_SERVICE.name())));
    }
}
