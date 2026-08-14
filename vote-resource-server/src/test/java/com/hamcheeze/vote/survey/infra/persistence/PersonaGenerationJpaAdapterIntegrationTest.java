package com.hamcheeze.vote.survey.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.survey.application.persona.PersonaGenerationPersistenceException;
import com.hamcheeze.vote.survey.application.persona.PersonaGenerationPersistenceException.ErrorCode;
import com.hamcheeze.vote.survey.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.survey.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.persona.PersonaGeneration;
import com.hamcheeze.vote.survey.domain.persona.PersonaGenerationStatus;
import com.hamcheeze.vote.survey.domain.persona.PersonaId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.sql.Timestamp;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class PersonaGenerationJpaAdapterIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-14T00:00:00Z");

    @Autowired
    private PersonaGenerationRepository generations;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private UUID contentId;
    private UUID roundId;

    @Test
    void preservesLifecycleAndSupportsEveryIdentityLookup() {
        SurveyResponseId responseId = insertResponse("user-a");
        PersonaGeneration generation = PersonaGeneration.pending(
                generationId(), responseId, NOW);

        PersonaGeneration inserted = generations.insert(generation);
        inserted.startProcessing(NOW.plusSeconds(1));
        generations.save(inserted);
        inserted.succeed(
                new PersonaId("persona-a"), NOW.plusSeconds(2));
        generations.save(inserted);

        assertThat(generations.findById(inserted.id()))
                .get()
                .satisfies(restored -> {
                    assertThat(restored.status())
                            .isEqualTo(PersonaGenerationStatus.SUCCEEDED);
                    assertThat(restored.attemptCount()).isEqualTo(1);
                    assertThat(restored.personaId())
                            .contains(new PersonaId("persona-a"));
                });
        assertThat(generations.findBySourceResponseId(responseId))
                .get().extracting(PersonaGeneration::id)
                .isEqualTo(inserted.id());
        assertThat(generations.findByPersonaId(
                new PersonaId("persona-a")))
                .get().extracting(PersonaGeneration::id)
                .isEqualTo(inserted.id());
    }

    @Test
    void locksAndClaimsTheOldestDispatchableGeneration() {
        SurveyResponseId firstResponse = insertResponse("user-a");
        SurveyResponseId secondResponse = insertResponse("user-b");
        PersonaGeneration first = PersonaGeneration.pending(
                generationId(), firstResponse, NOW);
        PersonaGeneration second = PersonaGeneration.pending(
                generationId(), secondResponse, NOW.plusSeconds(1));
        generations.insert(second);
        generations.insert(first);

        assertThat(generations.findNextDispatchableForUpdate(
                NOW.plusSeconds(1)))
                .get().extracting(PersonaGeneration::id)
                .isEqualTo(first.id());
    }

    @Test
    void translatesDuplicateResponseLinkToStableApplicationError() {
        SurveyResponseId responseId = insertResponse("user-a");
        generations.insert(PersonaGeneration.pending(
                generationId(), responseId, NOW));

        assertThatThrownBy(() -> generations.insert(
                PersonaGeneration.pending(
                        generationId(), responseId, NOW)))
                .isInstanceOfSatisfying(
                        PersonaGenerationPersistenceException.class,
                        exception -> assertThat(exception.errorCode())
                                .isEqualTo(ErrorCode
                                .RESPONSE_ALREADY_LINKED));
    }

    @Test
    void translatesDuplicatePersonaIdToStableApplicationError() {
        PersonaGeneration first = PersonaGeneration.pending(
                generationId(), insertResponse("user-a"), NOW);
        first.startProcessing(NOW.plusSeconds(1));
        first.succeed(new PersonaId("same-persona"), NOW.plusSeconds(2));
        generations.insert(first);
        PersonaGeneration second = PersonaGeneration.pending(
                generationId(), insertResponse("user-b"), NOW);
        second.startProcessing(NOW.plusSeconds(1));
        second.succeed(new PersonaId("same-persona"), NOW.plusSeconds(2));

        assertThatThrownBy(() -> generations.insert(second))
                .isInstanceOfSatisfying(
                        PersonaGenerationPersistenceException.class,
                        exception -> assertThat(exception.errorCode())
                                .isEqualTo(ErrorCode
                                        .PERSONA_ID_ALREADY_LINKED));
    }

    @Test
    void databaseRejectsSucceededStateWithoutPersonaId() {
        SurveyResponseId responseId = insertResponse("user-a");

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO persona_generations (
                    generation_id, survey_response_id, status,
                    attempt_count, created_at, processing_started_at,
                    completed_at, updated_at)
                VALUES (?, ?, 'SUCCEEDED', 1, ?, ?, ?, ?)
                """,
                UUID.randomUUID(), responseId.value(), timestamp(),
                timestamp(), timestamp(), timestamp()))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_persona_generation_state");
    }

    private SurveyResponseId insertResponse(String userId) {
        ensureRound();
        UUID responseId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id, content_version_id,
                    submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """, responseId, userId, roundId, contentId, timestamp());
        return new SurveyResponseId(responseId);
    }

    private void ensureRound() {
        if (roundId != null) {
            return;
        }
        contentId = UUID.randomUUID();
        roundId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, 'fixture', 'admin', ?,
                    'admin', ?, 'admin', ?)
                """, contentId, positiveLong(contentId), timestamp(),
                timestamp(), timestamp());
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    enforcement_mode, activated_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'ACTIVE', 'REQUIRED', ?, 'admin', ?, 0)
                """, roundId, positiveLong(roundId), contentId,
                timestamp(), timestamp());
    }

    private static long positiveLong(UUID value) {
        return (value.getLeastSignificantBits() & Long.MAX_VALUE) % 1_000_000
                + 1;
    }

    private static PersonaGenerationId generationId() {
        return new PersonaGenerationId(UUID.randomUUID());
    }

    private static Timestamp timestamp() {
        return Timestamp.from(NOW);
    }
}
