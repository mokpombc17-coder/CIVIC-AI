package com.hamcheeze.vote.persona.domain;

import com.hamcheeze.vote.persona.domain.common.PersonaDomainException;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PersonaVersionTest {

    @Test
    void recordsImmutablePersonaResultWithPredictedAdoptionRate() {
        Instant generatedAt = Instant.parse("2026-08-18T00:00:00Z");

        PersonaVersion version = new PersonaVersion(
                new PersonaVersionId(uuid(1)),
                new PersonaGenerationId(uuid(2)),
                new PersonaUserId("user-1"),
                new PersonaId("provider-persona-1"),
                new PredictedAdoptionRate(new BigDecimal("0.72")),
                new PersonaModelVersion("model-v3"),
                generatedAt,
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(uuid(3)));

        assertThat(version.personaVersionId().value()).isEqualTo(uuid(1));
        assertThat(version.generationId().value()).isEqualTo(uuid(2));
        assertThat(version.userId().value()).isEqualTo("user-1");
        assertThat(version.providerPersonaId().value())
                .isEqualTo("provider-persona-1");
        assertThat(version.predictedAdoptionRate().value())
                .isEqualByComparingTo("0.72");
        assertThat(version.modelVersion().value()).isEqualTo("model-v3");
        assertThat(version.generatedAt()).isEqualTo(generatedAt);
        assertThat(version.sourceType())
                .isEqualTo(PersonaSourceType.SURVEY_RESPONSE);
        assertThat(version.sourceId().value()).isEqualTo(uuid(3));
    }

    @Test
    void predictedAdoptionRateMustBeBetweenZeroAndOne() {
        assertInvalidRate("-0.01");
        assertInvalidRate("1.01");

        assertThat(new PredictedAdoptionRate(BigDecimal.ZERO).value())
                .isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(new PredictedAdoptionRate(BigDecimal.ONE).value())
                .isEqualByComparingTo(BigDecimal.ONE);
        assertThat(new PredictedAdoptionRate(new BigDecimal("0.50")))
                .isEqualTo(new PredictedAdoptionRate(new BigDecimal("0.5")));
    }

    @Test
    void personaOwnedTextValuesRejectBlankOrSurroundingWhitespace() {
        assertThatThrownBy(() -> new PersonaUserId(" "))
                .isInstanceOf(PersonaDomainException.class);
        assertThatThrownBy(() -> new PersonaUserId(" user-1"))
                .isInstanceOf(PersonaDomainException.class);
        assertThatThrownBy(() -> new PersonaModelVersion(" "))
                .isInstanceOf(PersonaDomainException.class);
        assertThatThrownBy(() -> new PersonaModelVersion("model-v3 "))
                .isInstanceOf(PersonaDomainException.class);
    }

    private static void assertInvalidRate(String value) {
        assertThatThrownBy(
                () -> new PredictedAdoptionRate(new BigDecimal(value)))
                .isInstanceOf(PersonaDomainException.class)
                .extracting(exception -> ((PersonaDomainException) exception)
                        .violation().code())
                .isEqualTo("PREDICTED_ADOPTION_RATE_OUT_OF_RANGE");
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13050000-0000-0000-0000-%012d".formatted(suffix));
    }
}
