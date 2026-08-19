package com.hamcheeze.vote.persona.domain;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaDomainException;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PersonaGenerationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-14T00:00:00Z");

    @Test
    void issuesPersonaIdAfterProcessing() {
        PersonaGeneration generation = pending();

        generation.startProcessing(CREATED_AT.plusSeconds(1));
        generation.succeed(
                new PersonaId("persona-external-1"),
                CREATED_AT.plusSeconds(2));

        assertThat(generation.status())
                .isEqualTo(PersonaGenerationStatus.SUCCEEDED);
        assertThat(generation.personaId())
                .contains(new PersonaId("persona-external-1"));
        assertThat(generation.attemptCount()).isEqualTo(1);
        assertThat(generation.completedAt())
                .contains(CREATED_AT.plusSeconds(2));
        assertThat(generation.isDispatchableAt(CREATED_AT.plusSeconds(3)))
                .isFalse();
    }

    @Test
    void retriesFailedGenerationWithSameIdentity() {
        PersonaGeneration generation = pending();
        PersonaGenerationId generationId = generation.id();

        generation.startProcessing(CREATED_AT.plusSeconds(1));
        generation.fail(
                "PERSONA_AI_TIMEOUT",
                CREATED_AT.plusSeconds(2),
                CREATED_AT.plusSeconds(10));

        assertThat(generation.isDispatchableAt(CREATED_AT.plusSeconds(9)))
                .isFalse();
        assertThat(generation.isDispatchableAt(CREATED_AT.plusSeconds(10)))
                .isTrue();

        generation.startProcessing(CREATED_AT.plusSeconds(10));
        generation.succeed(
                new PersonaId("persona-external-2"),
                CREATED_AT.plusSeconds(11));

        assertThat(generation.id()).isEqualTo(generationId);
        assertThat(generation.attemptCount()).isEqualTo(2);
        assertThat(generation.status())
                .isEqualTo(PersonaGenerationStatus.SUCCEEDED);
    }

    @Test
    void permanentFailureIsNotDispatchable() {
        PersonaGeneration generation = pending();
        generation.startProcessing(CREATED_AT.plusSeconds(1));

        generation.fail(
                "PERSONA_AI_INVALID_REQUEST",
                CREATED_AT.plusSeconds(2),
                null);

        assertThat(generation.status())
                .isEqualTo(PersonaGenerationStatus.FAILED);
        assertThat(generation.nextAttemptAt()).isEmpty();
        assertThat(generation.isDispatchableAt(CREATED_AT.plusSeconds(100)))
                .isFalse();
    }

    @Test
    void succeededGenerationCannotBeChangedOrRetried() {
        PersonaGeneration generation = pending();
        generation.startProcessing(CREATED_AT.plusSeconds(1));
        generation.succeed(
                new PersonaId("persona-external-3"),
                CREATED_AT.plusSeconds(2));

        assertThatThrownBy(() -> generation.succeed(
                new PersonaId("persona-external-4"),
                CREATED_AT.plusSeconds(3)))
                .isInstanceOf(PersonaDomainException.class)
                .extracting(exception -> ((PersonaDomainException) exception)
                        .violation().code())
                .isEqualTo("PERSONA_GENERATION_TRANSITION_NOT_ALLOWED");
        assertThatThrownBy(() -> generation.startProcessing(
                CREATED_AT.plusSeconds(3)))
                .isInstanceOf(PersonaDomainException.class);
    }

    @Test
    void rejectsBlankAndSurroundingWhitespacePersonaIds() {
        assertThatThrownBy(() -> new PersonaId(" "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PersonaId(" persona-id "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static PersonaGeneration pending() {
        return PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                CREATED_AT);
    }
}
