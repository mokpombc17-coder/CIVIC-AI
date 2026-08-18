package com.hamcheeze.vote.persona.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaVersionRepository;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.PersonaVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.persona.domain.common.PersonaVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class PersonaVersionJpaAdapterIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-18T00:00:00Z");

    @Autowired
    private PersonaGenerationRepository generations;

    @Autowired
    private PersonaVersionRepository versions;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private UUID contentId;
    private boolean activeRoundInserted;
    @Test
    void preservesVersionResultAndSupportsIdentityLookups() {
        PersonaGeneration generation = insertSucceededGeneration(
                "user-a", "provider-persona-a");
        PersonaVersion version = version(generation, "user-a", NOW);

        PersonaVersion inserted = versions.insert(version);

        assertThat(versions.findById(version.personaVersionId()))
                .contains(inserted);
        assertThat(versions.findByGenerationId(generation.id()))
                .contains(inserted);
        assertThat(versions.findLatestByUserId(
                new PersonaUserId("user-a")))
                .contains(inserted);
        assertThat(inserted.predictedAdoptionRate().value())
                .isEqualByComparingTo("0.72");
        assertThat(inserted.modelVersion().value())
                .isEqualTo("model-v3");
        assertThat(inserted.sourceType())
                .isEqualTo(PersonaSourceType.SURVEY_RESPONSE);
    }

    @Test
    void returnsLatestVersionWhilePreservingUserHistory() {
        PersonaGeneration firstGeneration = insertSucceededGeneration(
                "user-a", "provider-persona-a");
        PersonaVersion first = versions.insert(version(
                firstGeneration, "user-a", NOW.minusSeconds(1)));
        PersonaGeneration latestGeneration = insertSucceededGeneration(
                "user-a", "provider-persona-b");
        PersonaVersion latest = versions.insert(version(
                latestGeneration, "user-a", NOW));

        assertThat(versions.findById(first.personaVersionId()))
                .contains(first);
        assertThat(versions.findLatestByUserId(
                new PersonaUserId("user-a")))
                .contains(latest);
    }

    @Test
    void databaseRejectsPredictedAdoptionRateOutsideUnitRange() {
        PersonaGeneration generation = insertSucceededGeneration(
                "user-a", "provider-persona-a");

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO persona_versions (
                    persona_version_id, generation_id, user_id,
                    provider_persona_id, predicted_adoption_rate,
                    model_version, generated_at, source_type, source_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'SURVEY_RESPONSE', ?)
                """,
                UUID.randomUUID(),
                generation.id().value(),
                "user-a",
                "provider-persona-a",
                new BigDecimal("1.01"),
                "model-v3",
                timestamp(NOW),
                generation.sourceResponseId().value()))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "ck_persona_version_predicted_adoption_rate");
    }

    private PersonaGeneration insertSucceededGeneration(
            String userId,
            String personaId
    ) {
        SurveyResponseId responseId = insertResponse(userId);
        PersonaGeneration generation = PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                new PersonaSourceId(responseId.value()),
                NOW.minusSeconds(10));
        generation.startProcessing(NOW.minusSeconds(5));
        generation.succeed(new PersonaId(personaId), NOW);
        return generations.insert(generation);
    }

    private static PersonaVersion version(
            PersonaGeneration generation,
            String userId,
            Instant generatedAt
    ) {
        return new PersonaVersion(
                new PersonaVersionId(UUID.randomUUID()),
                generation.id(),
                new PersonaUserId(userId),
                generation.personaId().orElseThrow(),
                new PredictedAdoptionRate(new BigDecimal("0.72")),
                new PersonaModelVersion("model-v3"),
                generatedAt,
                PersonaSourceType.SURVEY_RESPONSE,
                generation.sourceResponseId());
    }

    private SurveyResponseId insertResponse(String userId) {
        ensureContent();
        UUID currentRoundId = insertRound();
        UUID responseId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id, content_version_id,
                    submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """, responseId, userId, currentRoundId, contentId,
                timestamp(NOW.minusSeconds(20)));
        return new SurveyResponseId(responseId);
    }

    private void ensureContent() {
        if (contentId != null) {
            return;
        }
        contentId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, 'fixture', 'admin', ?,
                    'admin', ?, 'admin', ?)
                """, contentId, positiveLong(contentId), timestamp(NOW),
                timestamp(NOW), timestamp(NOW));
    }

    private UUID insertRound() {
        UUID currentRoundId = UUID.randomUUID();
        if (activeRoundInserted) {
            jdbcTemplate.update("""
                    INSERT INTO survey_rounds (
                        round_id, round_number, content_version_id, status,
                        scheduled_at, created_by, created_at, row_version)
                    VALUES (?, ?, ?, 'SCHEDULED', ?, 'admin', ?, 0)
                    """, currentRoundId, positiveLong(currentRoundId),
                    contentId, timestamp(NOW), timestamp(NOW));
            return currentRoundId;
        }
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    enforcement_mode, activated_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'ACTIVE', 'REQUIRED', ?, 'admin', ?, 0)
                """, currentRoundId, positiveLong(currentRoundId), contentId,
                timestamp(NOW), timestamp(NOW));
        activeRoundInserted = true;
        return currentRoundId;
    }

    private static long positiveLong(UUID value) {
        return (value.getLeastSignificantBits() & Long.MAX_VALUE) % 1_000_000
                + 1;
    }

    private static Timestamp timestamp(Instant instant) {
        return Timestamp.from(instant);
    }
}
