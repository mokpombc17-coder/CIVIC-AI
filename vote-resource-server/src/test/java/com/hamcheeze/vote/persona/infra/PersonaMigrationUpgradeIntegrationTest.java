package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.PersonaGenerationInputSnapshot;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.infra.persistence.PersonaGenerationInputJdbcAdapter;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = "vote.persona.enabled=false")
@ActiveProfiles({"local", "test"})
@Import(TestcontainersConfiguration.class)
class PersonaMigrationUpgradeIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-19T00:00:00Z");

    @Autowired
    private PostgreSQLContainer postgres;

    @Test
    void upgradesRealV20PersonaRowsThroughV21AndLatest() {
        String schema = "persona_upgrade_"
                + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate admin = new JdbcTemplate(baseDataSource());
        admin.execute("CREATE SCHEMA " + schema);
        try {
            DataSource isolated = schemaDataSource(schema);
            JdbcTemplate jdbc = new JdbcTemplate(isolated);
            Flyway v20 = flyway(isolated, "20");
            v20.migrate();

            Map<String, Fixture> fixtures = insertV20Fixtures(jdbc);

            Flyway v21 = flyway(isolated, "21");
            v21.migrate();
            Fixture processing = fixtures.get("processing");
            assertThat(row(jdbc, processing.generationId(), "status"))
                    .isEqualTo("FAILED");
            assertThat(row(jdbc, processing.generationId(),
                    "last_error_code"))
                    .isEqualTo("PERSONA_PROCESSING_LEASE_MIGRATED");
            assertThat(jdbc.queryForObject("""
                    SELECT count(*) FROM persona_generation_attempts
                    WHERE generation_id = ?
                      AND outcome = 'LEASE_EXPIRED'
                      AND error_code = 'PERSONA_PROCESSING_LEASE_MIGRATED'
                      AND worker_id = 'flyway-v21'
                    """, Long.class, processing.generationId()))
                    .isEqualTo(1);

            Fixture manual = fixtures.get("manual-retry");
            Instant manualAt = jdbc.queryForObject("""
                    SELECT next_attempt_at FROM persona_generations
                    WHERE generation_id = ?
                    """, Timestamp.class, manual.generationId()).toInstant();
            jdbc.update("""
                    INSERT INTO persona_generation_retry_requests (
                        retry_request_id, generation_id, idempotency_key,
                        failed_attempt_count, requested_by, requested_at,
                        reason, request_fingerprint)
                    VALUES (?, ?, 'legacy-manual', 2, 'operator-a', ?,
                        'legacy recovery', ?)
                    """, UUID.randomUUID(), manual.generationId(),
                    Timestamp.from(manualAt), "a".repeat(64));

            Flyway latest = flyway(isolated, null);
            latest.migrate();
            latest.validate();

            assertThat(row(jdbc, manual.generationId(), "retry_trigger"))
                    .isEqualTo("MANUAL");
            assertThat(row(jdbc,
                    fixtures.get("automatic-retry").generationId(),
                    "retry_trigger")).isEqualTo("AUTOMATIC");
            assertThat(row(jdbc,
                    fixtures.get("terminal").generationId(),
                    "retry_trigger")).isNull();
            assertThat(row(jdbc,
                    fixtures.get("succeeded").generationId(),
                    "status")).isEqualTo("SUCCEEDED");
            assertThat(jdbc.queryForObject(
                    "SELECT count(*) FROM persona_versions",
                    Long.class)).isEqualTo(1);

            backfillExactInputs(isolated, fixtures);
            assertThat(jdbc.queryForObject(
                    "SELECT count(*) FROM persona_generation_inputs",
                    Long.class)).isEqualTo(fixtures.size());
            fixtures.values().forEach(fixture -> {
                String payload = jdbc.queryForObject("""
                        SELECT request_payload
                        FROM persona_generation_inputs
                        WHERE generation_id = ?
                        """, String.class, fixture.generationId());
                String fingerprint = jdbc.queryForObject("""
                        SELECT request_fingerprint
                        FROM persona_generation_inputs
                        WHERE generation_id = ?
                        """, String.class, fixture.generationId());
                assertThat(fingerprint).isEqualTo(
                        PersonaGenerationInputSnapshot.fingerprint(payload));
            });
            assertThat(jdbc.queryForObject("""
                    SELECT count(*)
                    FROM persona_generations generation
                    WHERE status IN ('PENDING', 'FAILED')
                      AND next_attempt_at <= CURRENT_TIMESTAMP
                      AND EXISTS (
                          SELECT 1 FROM persona_generation_inputs input
                          WHERE input.generation_id = generation.generation_id)
                    """, Long.class)).isGreaterThan(0);

            assertThatThrownBy(() -> jdbc.update("""
                    UPDATE persona_generations
                    SET retry_trigger = NULL
                    WHERE generation_id = ?
                    """, manual.generationId()))
                    .isInstanceOf(DataIntegrityViolationException.class);
        } finally {
            admin.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }

    private Map<String, Fixture> insertV20Fixtures(JdbcTemplate jdbc) {
        Map<String, Fixture> fixtures = new LinkedHashMap<>();
        fixtures.put("pending", fixture());
        fixtures.put("processing", fixture());
        fixtures.put("automatic-retry", fixture());
        fixtures.put("manual-retry", fixture());
        fixtures.put("terminal", fixture());
        fixtures.put("succeeded", fixture());

        insertGeneration(jdbc, fixtures.get("pending"), "PENDING", 0,
                null, null, null, CREATED_AT, null);
        insertGeneration(jdbc, fixtures.get("processing"), "PROCESSING", 2,
                null, null, CREATED_AT.plusSeconds(10), null, null);
        insertGeneration(jdbc, fixtures.get("automatic-retry"), "FAILED", 1,
                null, "TIMEOUT", CREATED_AT.plusSeconds(10),
                CREATED_AT.plusSeconds(30), null);
        insertGeneration(jdbc, fixtures.get("manual-retry"), "FAILED", 2,
                null, "TIMEOUT", CREATED_AT.plusSeconds(10),
                CREATED_AT.plusSeconds(40), null);
        insertGeneration(jdbc, fixtures.get("terminal"), "FAILED", 3,
                null, "INVALID_RESPONSE", CREATED_AT.plusSeconds(10),
                null, null);
        insertGeneration(jdbc, fixtures.get("succeeded"), "SUCCEEDED", 1,
                "persona-legacy", null, CREATED_AT.plusSeconds(10),
                null, CREATED_AT.plusSeconds(20));
        Fixture succeeded = fixtures.get("succeeded");
        jdbc.update("""
                INSERT INTO persona_versions (
                    persona_version_id, generation_id, user_id,
                    provider_persona_id, predicted_adoption_rate,
                    model_version, generated_at, source_type, source_id)
                VALUES (?, ?, ?, 'persona-legacy', 0.700000,
                    'legacy-model', ?, 'SURVEY_RESPONSE', ?)
                """, UUID.randomUUID(), succeeded.generationId(),
                succeeded.userId(), Timestamp.from(CREATED_AT.plusSeconds(20)),
                succeeded.sourceId());
        return fixtures;
    }

    private static void insertGeneration(
            JdbcTemplate jdbc,
            Fixture fixture,
            String status,
            int attempts,
            String personaId,
            String error,
            Instant processingAt,
            Instant nextAttemptAt,
            Instant completedAt
    ) {
        jdbc.update("""
                INSERT INTO persona_generations (
                    generation_id, source_type, source_id, persona_id,
                    status, attempt_count, last_error_code, created_at,
                    processing_started_at, completed_at, next_attempt_at,
                    updated_at)
                VALUES (?, 'SURVEY_RESPONSE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, fixture.generationId(), fixture.sourceId(), personaId,
                status, attempts, error, Timestamp.from(CREATED_AT),
                timestamp(processingAt), timestamp(completedAt),
                nextAttemptAt == null && "PENDING".equals(status)
                        ? Timestamp.from(CREATED_AT)
                        : timestamp(nextAttemptAt),
                Timestamp.from(CREATED_AT));
    }

    private static void backfillExactInputs(
            DataSource dataSource,
            Map<String, Fixture> fixtures
    ) {
        var repository = new PersonaGenerationInputJdbcAdapter(
                new JdbcTemplate(dataSource));
        var factory = new PersonaGenerationInputSnapshotFactoryAdapter(
                new ObjectMapper());
        fixtures.values().forEach(fixture -> {
            PersonaGenerationId generationId =
                    new PersonaGenerationId(fixture.generationId());
            PersonaSurveySource source = new PersonaSurveySource(
                    new PersonaSourceId(fixture.sourceId()),
                    new PersonaUserId(fixture.userId()),
                    UUID.randomUUID(), 1, UUID.randomUUID(), 1,
                    CREATED_AT, List.of());
            PersonaGenerationInputSnapshot input = factory.create(
                    generationId, source, CREATED_AT);
            repository.insert(input);
        });
    }

    private static Object row(
            JdbcTemplate jdbc,
            UUID generationId,
            String column
    ) {
        return jdbc.queryForObject(
                "SELECT " + column
                        + " FROM persona_generations WHERE generation_id = ?",
                Object.class,
                generationId);
    }

    private Flyway flyway(DataSource dataSource, String target) {
        var configuration = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration");
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private DataSource baseDataSource() {
        return new DriverManagerDataSource(
                postgres.getJdbcUrl(),
                postgres.getUsername(),
                postgres.getPassword());
    }

    private DataSource schemaDataSource(String schema) {
        String separator = postgres.getJdbcUrl().contains("?") ? "&" : "?";
        return new DriverManagerDataSource(
                postgres.getJdbcUrl() + separator + "currentSchema=" + schema,
                postgres.getUsername(),
                postgres.getPassword());
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static Fixture fixture() {
        UUID generationId = UUID.randomUUID();
        return new Fixture(
                generationId,
                UUID.randomUUID(),
                "user-" + generationId.toString().substring(0, 8));
    }

    private record Fixture(
            UUID generationId,
            UUID sourceId,
            String userId
    ) {
    }
}
