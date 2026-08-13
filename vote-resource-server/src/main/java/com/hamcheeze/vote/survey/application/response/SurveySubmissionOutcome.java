package com.hamcheeze.vote.survey.application.response;

import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyViolation;
import com.hamcheeze.vote.survey.domain.response.SurveyResponseSubmitted;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public record SurveySubmissionOutcome(
        int httpStatus,
        String code,
        SurveyResponseId responseId,
        SurveyRoundId roundId,
        SurveyContentVersionId contentVersionId,
        Instant submittedAt,
        List<SurveyViolation> violations
) {

    public SurveySubmissionOutcome {
        if (httpStatus < 200 || httpStatus > 499) {
            throw new IllegalArgumentException("invalid httpStatus");
        }
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("code must not be blank");
        }
        violations = List.copyOf(Objects.requireNonNull(
                violations, "violations"));
        boolean successful = httpStatus >= 200 && httpStatus <= 299;
        if (successful) {
            Objects.requireNonNull(responseId, "responseId");
            Objects.requireNonNull(roundId, "roundId");
            Objects.requireNonNull(contentVersionId, "contentVersionId");
            Objects.requireNonNull(submittedAt, "submittedAt");
        } else if (responseId != null || contentVersionId != null
                || submittedAt != null) {
            throw new IllegalArgumentException(
                    "rejected outcome cannot contain a submitted response");
        }
    }

    public static SurveySubmissionOutcome submitted(
            SurveyResponseSubmitted event
    ) {
        return new SurveySubmissionOutcome(
                201,
                "SURVEY_RESPONSE_SUBMITTED",
                event.responseId(),
                event.roundId(),
                event.contentVersionId(),
                event.submittedAt(),
                List.of());
    }

    public static SurveySubmissionOutcome rejected(
            int httpStatus,
            String code,
            SurveyRoundId roundId,
            List<SurveyViolation> violations
    ) {
        return new SurveySubmissionOutcome(
                httpStatus,
                code,
                null,
                roundId,
                null,
                null,
                violations);
    }

    public boolean succeeded() {
        return httpStatus >= 200 && httpStatus <= 299;
    }

    public Optional<SurveyResponseSubmitted> submittedEvent() {
        if (!succeeded()) {
            return Optional.empty();
        }
        return Optional.of(new SurveyResponseSubmitted(
                responseId,
                roundId,
                contentVersionId,
                submittedAt));
    }
}
