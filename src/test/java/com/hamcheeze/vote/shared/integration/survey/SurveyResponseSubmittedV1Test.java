package com.hamcheeze.vote.shared.integration.survey;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyResponseSubmittedV1Test {

    @Test
    void exposesStableV1ContractMetadataAndPayload() {
        UUID responseId = uuid(1);
        SurveyResponseSubmittedV1 event = new SurveyResponseSubmittedV1(
                "user-1",
                responseId,
                uuid(2),
                uuid(3),
                Instant.parse("2026-08-18T00:00:00Z"));

        assertThat(SurveyResponseSubmittedV1.EVENT_TYPE)
                .isEqualTo("survey.response-submitted");
        assertThat(SurveyResponseSubmittedV1.AGGREGATE_TYPE)
                .isEqualTo("SURVEY_RESPONSE");
        assertThat(SurveyResponseSubmittedV1.SCHEMA_VERSION).isEqualTo(1);
        assertThat(event.responseId()).isEqualTo(responseId);
        assertThat(event.userId()).isEqualTo("user-1");
    }

    @Test
    void rejectsBlankOrUntrimmedUserId() {
        assertThatThrownBy(() -> event(" "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> event(" user-1"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static SurveyResponseSubmittedV1 event(String userId) {
        return new SurveyResponseSubmittedV1(
                userId,
                uuid(1),
                uuid(2),
                uuid(3),
                Instant.parse("2026-08-18T00:00:00Z"));
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13070000-0000-0000-0000-%012d".formatted(suffix));
    }
}
