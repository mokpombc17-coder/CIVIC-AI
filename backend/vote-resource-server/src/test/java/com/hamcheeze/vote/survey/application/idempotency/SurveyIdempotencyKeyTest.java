package com.hamcheeze.vote.survey.application.idempotency;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyIdempotencyKeyTest {

    @Test
    void parsesAndCanonicalizesAUuid() {
        UUID value = UUID.fromString(
                "07af9111-3e20-43e5-ae80-78d1bf547647");

        SurveyIdempotencyKey key = SurveyIdempotencyKey.parse(
                value.toString().toUpperCase());

        assertThat(key.value()).isEqualTo(value);
        assertThat(key.toString()).isEqualTo(value.toString());
    }

    @Test
    void rejectsMissingAndNonCanonicalValuesWithTheChatContract() {
        assertInvalid(null);
        assertInvalid("");
        assertInvalid("not-a-uuid");
        assertInvalid("1-1-1-1-1");
    }

    private static void assertInvalid(String value) {
        assertThatThrownBy(() -> SurveyIdempotencyKey.parse(value))
                .isInstanceOfSatisfying(
                        SurveyIdempotencyException.class,
                        exception -> {
                            assertThat(exception.code()).isEqualTo(
                                    SurveyIdempotencyErrorCode
                                            .INVALID_IDEMPOTENCY_KEY);
                            assertThat(exception.httpStatus()).isEqualTo(400);
                        });
    }
}
