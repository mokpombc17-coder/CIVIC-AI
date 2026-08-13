package com.hamcheeze.vote.survey.application.response;

import com.hamcheeze.vote.survey.application.idempotency.StoredSurveyIdempotencyOutcome;
import com.hamcheeze.vote.survey.application.idempotency.SurveyIdempotencyOutcomeCodec;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.Objects;

@Component
public class SurveySubmissionOutcomeCodec
        implements SurveyIdempotencyOutcomeCodec<SurveySubmissionOutcome> {

    public static final int SCHEMA_VERSION = 1;

    private final ObjectMapper objectMapper;

    public SurveySubmissionOutcomeCodec(ObjectMapper objectMapper) {
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
    }

    @Override
    public StoredSurveyIdempotencyOutcome encode(
            SurveySubmissionOutcome outcome
    ) {
        Objects.requireNonNull(outcome, "outcome");
        try {
            return new StoredSurveyIdempotencyOutcome(
                    SCHEMA_VERSION,
                    outcome.httpStatus(),
                    objectMapper.writeValueAsString(outcome),
                    outcome.responseId());
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to encode survey submission outcome", exception);
        }
    }

    @Override
    public SurveySubmissionOutcome decode(
            StoredSurveyIdempotencyOutcome storedOutcome
    ) {
        Objects.requireNonNull(storedOutcome, "storedOutcome");
        if (storedOutcome.schemaVersion() != SCHEMA_VERSION) {
            throw new IllegalStateException(
                    "unsupported survey submission outcome schema: "
                            + storedOutcome.schemaVersion());
        }
        try {
            return objectMapper.readValue(
                    storedOutcome.payload(),
                    SurveySubmissionOutcome.class);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "failed to decode survey submission outcome", exception);
        }
    }
}
