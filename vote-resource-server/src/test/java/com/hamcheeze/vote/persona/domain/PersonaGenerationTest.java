package com.hamcheeze.vote.persona.domain;

import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
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

        PersonaGenerationClaimToken token = claim(
                generation, CREATED_AT.plusSeconds(1));
        generation.succeed(
                token,
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

        PersonaGenerationClaimToken firstToken = claim(
                generation, CREATED_AT.plusSeconds(1));
        generation.fail(
                firstToken,
                "PERSONA_AI_TIMEOUT",
                CREATED_AT.plusSeconds(2),
                CREATED_AT.plusSeconds(10));

        assertThat(generation.isDispatchableAt(CREATED_AT.plusSeconds(9)))
                .isFalse();
        assertThat(generation.isDispatchableAt(CREATED_AT.plusSeconds(10)))
                .isTrue();

        PersonaGenerationClaimToken secondToken = claim(
                generation, CREATED_AT.plusSeconds(10));
        generation.succeed(
                secondToken,
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
        PersonaGenerationClaimToken token = claim(
                generation, CREATED_AT.plusSeconds(1));

        generation.fail(
                token,
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
    void succeededGenerationIgnoresLateCompletionAndCannotBeRetried() {
        PersonaGeneration generation = pending();
        PersonaGenerationClaimToken token = claim(
                generation, CREATED_AT.plusSeconds(1));
        generation.succeed(
                token,
                new PersonaId("persona-external-3"),
                CREATED_AT.plusSeconds(2));

        assertThat(generation.succeed(
                token,
                new PersonaId("persona-external-4"),
                CREATED_AT.plusSeconds(3))).isFalse();
        assertThat(generation.personaId())
                .contains(new PersonaId("persona-external-3"));
        assertThatThrownBy(() -> generation.claim(
                new PersonaGenerationClaimToken(UUID.randomUUID()),
                CREATED_AT.plusSeconds(3),
                CREATED_AT.plusSeconds(30)))
                .isInstanceOf(PersonaDomainException.class);
    }

    @Test
    void rejectsBlankAndSurroundingWhitespacePersonaIds() {
        assertThatThrownBy(() -> new PersonaId(" "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PersonaId(" persona-id "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void onlyProcessingOwnsClaimTokenAndLease() {
        PersonaGeneration generation = pending();
        PersonaGenerationClaimToken token = claim(
                generation, CREATED_AT.plusSeconds(1));

        assertThat(generation.status())
                .isEqualTo(PersonaGenerationStatus.PROCESSING);
        assertThat(generation.claimToken()).contains(token);
        assertThat(generation.leaseExpiresAt())
                .contains(CREATED_AT.plusSeconds(61));
        assertThat(generation.nextAttemptAt()).isEmpty();
    }

    @Test
    void staleSuccessAndFailureCannotChangeCurrentClaim() {
        PersonaGeneration generation = pending();
        PersonaGenerationClaimToken current = claim(
                generation, CREATED_AT.plusSeconds(1));
        PersonaGenerationClaimToken stale =
                new PersonaGenerationClaimToken(UUID.randomUUID());

        assertThat(generation.succeed(
                stale,
                new PersonaId("stale-persona"),
                CREATED_AT.plusSeconds(2))).isFalse();
        assertThat(generation.fail(
                stale,
                "STALE_FAILURE",
                CREATED_AT.plusSeconds(2),
                null)).isFalse();

        assertThat(generation.status())
                .isEqualTo(PersonaGenerationStatus.PROCESSING);
        assertThat(generation.claimToken()).contains(current);
        assertThat(generation.personaId()).isEmpty();
    }

    @Test
    void leaseExpiresOnlyAtOrAfterExpirationAndCanBecomeTerminal() {
        PersonaGeneration generation = pending();
        PersonaGenerationClaimToken token = claim(
                generation, CREATED_AT.plusSeconds(1));

        assertThat(generation.expireLease(
                token,
                CREATED_AT.plusSeconds(60),
                null)).isFalse();
        assertThat(generation.expireLease(
                token,
                CREATED_AT.plusSeconds(61),
                null)).isTrue();

        assertThat(generation.status())
                .isEqualTo(PersonaGenerationStatus.FAILED);
        assertThat(generation.lastErrorCode())
                .contains("PERSONA_PROCESSING_LEASE_EXPIRED");
        assertThat(generation.nextAttemptAt()).isEmpty();
        assertThat(generation.claimToken()).isEmpty();
    }

    @Test
    void manualRetryOnlySchedulesTerminalFailureWithoutResettingAttempts() {
        PersonaGeneration generation = pending();
        PersonaGenerationClaimToken token = claim(
                generation, CREATED_AT.plusSeconds(1));
        generation.fail(
                token, "TERMINAL", CREATED_AT.plusSeconds(2), null);

        generation.scheduleManualRetry(CREATED_AT.plusSeconds(3));

        assertThat(generation.attemptCount()).isEqualTo(1);
        assertThat(generation.nextAttemptAt())
                .contains(CREATED_AT.plusSeconds(3));
        PersonaGenerationClaimToken retryToken = claim(
                generation, CREATED_AT.plusSeconds(3));
        assertThat(generation.attemptCount()).isEqualTo(2);
        assertThat(generation.claimToken()).contains(retryToken);
    }

    @Test
    void restoreRejectsProcessingWithoutClaimLease() {
        assertThatThrownBy(() -> PersonaGeneration.restore(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                PersonaGenerationStatus.PROCESSING,
                1,
                null,
                null,
                CREATED_AT,
                CREATED_AT.plusSeconds(1),
                null,
                null,
                null,
                null,
                CREATED_AT.plusSeconds(1)))
                .isInstanceOf(PersonaDomainException.class);
    }

    private static PersonaGeneration pending() {
        return PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                CREATED_AT);
    }

    private static PersonaGenerationClaimToken claim(
            PersonaGeneration generation,
            Instant startedAt
    ) {
        PersonaGenerationClaimToken token =
                new PersonaGenerationClaimToken(UUID.randomUUID());
        generation.claim(token, startedAt, startedAt.plusSeconds(60));
        return token;
    }
}
