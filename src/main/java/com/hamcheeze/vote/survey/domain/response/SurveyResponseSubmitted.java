package com.hamcheeze.vote.survey.domain.response;

import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;

import java.time.Instant;
import java.util.Objects;

public record SurveyResponseSubmitted(
        SurveyResponseId responseId,
        SurveyRoundId roundId,
        SurveyContentVersionId contentVersionId,
        Instant submittedAt
) {

    public SurveyResponseSubmitted {
        Objects.requireNonNull(responseId, "responseId");
        Objects.requireNonNull(roundId, "roundId");
        Objects.requireNonNull(contentVersionId, "contentVersionId");
        Objects.requireNonNull(submittedAt, "submittedAt");
    }
}
