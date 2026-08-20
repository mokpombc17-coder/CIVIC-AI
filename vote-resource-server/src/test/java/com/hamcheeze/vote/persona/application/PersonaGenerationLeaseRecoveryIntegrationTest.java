package com.hamcheeze.vote.persona.application;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationAttemptRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.infra.PersonaGenerationProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@SpringBootTest
@ActiveProfiles({"local", "test"})
@Import({
        TestcontainersConfiguration.class,
        PersonaGenerationLeaseRecoveryIntegrationTest.ClockConfiguration.class
})
class PersonaGenerationLeaseRecoveryIntegrationTest {

    private static final Instant INITIAL =
            Instant.parse("2026-08-20T00:00:00Z");

    @Autowired
    private PersonaGenerationStateService states;

    @Autowired
    private PersonaGenerationRepository generations;

    @MockitoSpyBean
    private PersonaVersionRepository versions;

    @Autowired
    private MutableClock clock;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    @AfterEach
    void reset() {
        clock.set(INITIAL);
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    persona_generation_retry_requests,
                    persona_generation_attempts,
                    persona_versions,
                    persona_generations
                CASCADE
                """);
    }

    @Test
    void processExitLeaseRecoveryNewAttemptAndLateCompletionAreFenced() {
        PersonaGeneration generation = generations.insert(pending());
        var first = states.claimNext("instance-a:worker-1").orElseThrow();

        clock.set(first.leaseExpiresAt().plusSeconds(1));
        assertThat(states.reapExpired(10)).isEqualTo(1);
        PersonaGeneration retryWait = generations.findById(
                generation.id()).orElseThrow();
        assertThat(retryWait.nextAttemptAt()).isPresent();

        clock.set(retryWait.nextAttemptAt().orElseThrow());
        var second = states.claimNext("instance-b:worker-1").orElseThrow();
        assertThat(second.claimToken()).isNotEqualTo(first.claimToken());
        assertThat(second.attemptNumber()).isEqualTo(2);

        PersonaSurveySource source = source(generation.sourceId());
        assertThat(states.succeed(
                generation.id(), second.claimToken(), source,
                result(generation.id())))
                .isEqualTo(PersonaGenerationStateService.CompletionResult.APPLIED);
        assertThat(states.succeed(
                generation.id(), first.claimToken(), source,
                result(generation.id())))
                .isEqualTo(PersonaGenerationStateService.CompletionResult
                        .IGNORED_STALE_CLAIM);

        assertThat(count("persona_versions")).isEqualTo(1);
        assertThat(generations.findById(generation.id()).orElseThrow()
                .attemptCount()).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM persona_generation_attempts
                WHERE outcome = 'LEASE_EXPIRED'
                  AND late_completion_observed_at IS NOT NULL
                """, Long.class)).isEqualTo(1);
    }

    @Test
    void personaVersionFailureRollsBackGenerationSuccessAndAttempt() {
        PersonaGeneration generation = generations.insert(pending());
        var claim = states.claimNext("instance-a:worker-1").orElseThrow();
        doThrow(new IllegalStateException("forced version failure"))
                .when(versions).insert(any());

        assertThatThrownBy(() -> states.succeed(
                generation.id(), claim.claimToken(),
                source(generation.sourceId()), result(generation.id())))
                .hasRootCauseMessage("forced version failure");

        PersonaGeneration persisted = generations.findById(
                generation.id()).orElseThrow();
        assertThat(persisted.status().name()).isEqualTo("PROCESSING");
        assertThat(persisted.claimToken()).contains(claim.claimToken());
        assertThat(count("persona_versions")).isZero();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM persona_generation_attempts
                WHERE outcome = 'PROCESSING'
                """, Long.class)).isEqualTo(1);
    }

    @Test
    void concurrentWorkersClaimOneGenerationOnce() throws Exception {
        generations.insert(pending());
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> first = executor.submit(() -> {
                start.await();
                return states.claimNext("instance-a:worker-1").isPresent();
            });
            Future<Boolean> second = executor.submit(() -> {
                start.await();
                return states.claimNext("instance-b:worker-1").isPresent();
            });
            start.countDown();

            assertThat(List.of(first.get(), second.get()))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(count("persona_generation_attempts")).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT attempt_count FROM persona_generations
                """, Integer.class)).isEqualTo(1);
    }

    @Test
    void concurrentReapersExpireOneLeaseOnce() throws Exception {
        generations.insert(pending());
        var claim = states.claimNext("instance-a:worker-1").orElseThrow();
        clock.set(claim.leaseExpiresAt().plusSeconds(1));
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Integer> first = executor.submit(() -> {
                start.await();
                return states.reapExpired(1);
            });
            Future<Integer> second = executor.submit(() -> {
                start.await();
                return states.reapExpired(1);
            });
            start.countDown();

            assertThat(List.of(first.get(), second.get()))
                    .containsExactlyInAnyOrder(1, 0);
        }
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM persona_generation_attempts
                WHERE outcome = 'LEASE_EXPIRED'
                """, Long.class)).isEqualTo(1);
        assertThat(generations.findById(
                claim.generation().id()).orElseThrow().attemptCount())
                .isEqualTo(1);
    }

    @Test
    void concurrentWorkersCanClaimDifferentGenerations() throws Exception {
        generations.insert(pending());
        generations.insert(pending());
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> first = executor.submit(() -> {
                start.await();
                return states.claimNext("instance-a:worker-1").isPresent();
            });
            Future<Boolean> second = executor.submit(() -> {
                start.await();
                return states.claimNext("instance-b:worker-1").isPresent();
            });
            start.countDown();

            assertThat(first.get()).isTrue();
            assertThat(second.get()).isTrue();
        }
        assertThat(count("persona_generation_attempts")).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(DISTINCT generation_id)
                FROM persona_generation_attempts
                """, Long.class)).isEqualTo(2);
    }

    private static PersonaGeneration pending() {
        return PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                INITIAL);
    }

    private static PersonaSurveySource source(PersonaSourceId sourceId) {
        return new PersonaSurveySource(
                sourceId, new PersonaUserId("user-a"),
                UUID.randomUUID(), 1, UUID.randomUUID(), 1,
                INITIAL, List.of());
    }

    private static PersonaCreationResult result(
            PersonaGenerationId generationId
    ) {
        return new PersonaCreationResult(
                generationId,
                new PersonaId("persona-" + generationId.value()),
                new PredictedAdoptionRate(new BigDecimal("0.72")),
                new PersonaModelVersion("model-v3"));
    }

    private long count(String table) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM " + table, Long.class);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ClockConfiguration {

        @Bean
        MutableClock mutablePersonaClock() {
            return new MutableClock(INITIAL);
        }

        @Bean
        @Primary
        PersonaGenerationStateService deterministicPersonaStates(
                PersonaGenerationRepository generations,
                PersonaVersionRepository versions,
                PersonaGenerationAttemptRepository attempts,
                PersonaGenerationProperties properties,
                MutableClock clock
        ) {
            properties.setProcessingLeaseDuration(Duration.ofSeconds(10));
            properties.setRetryInitialDelay(Duration.ofSeconds(2));
            properties.setRetryMaxDelay(Duration.ofSeconds(10));
            properties.setMaxAttempts(3);
            return new PersonaGenerationStateService(
                    generations, versions, attempts, properties, clock,
                    UUID::randomUUID);
        }
    }

    static final class MutableClock extends Clock {

        private volatile Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void set(Instant value) {
            instant = value;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
