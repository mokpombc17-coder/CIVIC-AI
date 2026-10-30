package com.hamcheeze.vote.survey.application.response;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class SurveyResponseSubmissionServiceTest {

    @Test
    void normalizesSubmissionTimeToPostgresMicrosecondPrecision() {
        Instant systemClockValue =
                Instant.parse("2026-08-28T03:06:33.660233803Z");

        Instant normalized = SurveyResponseSubmissionService
                .persistenceSafeInstant(systemClockValue);

        assertThat(normalized)
                .isEqualTo(Instant.parse("2026-08-28T03:06:33.660233Z"));
        assertThat(normalized.getNano() % 1_000).isZero();
    }
}
