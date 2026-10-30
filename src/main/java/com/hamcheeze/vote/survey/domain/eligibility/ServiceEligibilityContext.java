package com.hamcheeze.vote.survey.domain.eligibility;

import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record ServiceEligibilityContext(
        SurveyUserId userId,
        List<SurveyRound> activeRoundCandidates,
        boolean hasCurrentRoundResponse,
        boolean hasResponseBeforeCurrentRound,
        Instant evaluatedAt
) {

    public ServiceEligibilityContext {
        Objects.requireNonNull(userId, "userId");
        activeRoundCandidates = List.copyOf(Objects.requireNonNull(
                activeRoundCandidates,
                "activeRoundCandidates"));
        if (activeRoundCandidates.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException(
                    "activeRoundCandidates must not contain null");
        }
        Objects.requireNonNull(evaluatedAt, "evaluatedAt");
    }
}
