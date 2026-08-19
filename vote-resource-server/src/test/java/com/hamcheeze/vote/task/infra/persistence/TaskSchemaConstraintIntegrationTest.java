package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class TaskSchemaConstraintIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-01-01T00:00:00Z");
    private static final AtomicLong SURVEY_VERSION =
            new AtomicLong(10_000);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void migratesCompleteTaskSchemaAtVersionFour() {
        List<String> expectedTables = List.of(
                "tasks",
                "task_questions",
                "task_options",
                "task_lifecycle_history",
                "task_predictions",
                "task_prediction_candidates",
                "task_prediction_candidate_selections",
                "task_prediction_attempts",
                "task_submissions",
                "task_submission_answers",
                "task_submission_answer_selections",
                "task_submission_receipts");

        List<String> actualTables = jdbcTemplate.queryForList("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name LIKE 'task%'
                """, String.class);
        Integer migrationCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM flyway_schema_history
                WHERE version = '4' AND success = true
                """, Integer.class);

        assertThat(actualTables)
                .containsExactlyInAnyOrderElementsOf(expectedTables);
        assertThat(migrationCount).isEqualTo(1);
    }

    @Test
    void storesCompleteValidTaskAggregateGraph() {
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture persona = insertSucceededPersona("user-valid");
        UUID predictionId = insertSucceededPrediction(
                "user-valid", task.taskId(), persona);
        CandidateFixture selected = insertSingleChoiceCandidate(
                predictionId, task, task.firstOptionId(), 1);
        insertSingleChoiceCandidate(
                predictionId, task, task.secondOptionId(), 1);
        insertShortTextCandidate(predictionId, task, 1);
        insertSuccessfulAttempt(predictionId, 1);

        UUID submissionId = UUID.randomUUID();
        insertSubmission(
                submissionId, "user-valid", task.taskId(), persona,
                predictionId);
        insertAiAcceptedAnswer(
                submissionId, predictionId, task,
                selected.candidateId());
        insertDirectShortTextAnswer(
                submissionId, predictionId, task, "직접 답변");
        insertSucceededReceipt("user-valid", submissionId);

        Integer tasks = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM tasks WHERE task_id = ?",
                Integer.class, task.taskId());
        Integer candidates = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM task_prediction_candidates "
                        + "WHERE prediction_id = ?",
                Integer.class, predictionId);
        Integer answers = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM task_submission_answers "
                        + "WHERE submission_id = ?",
                Integer.class, submissionId);

        assertThat(tasks).isEqualTo(1);
        assertThat(candidates).isEqualTo(3);
        assertThat(answers).isEqualTo(2);
    }

    @Test
    void rejectsTaskStateThatContradictsItsSchedule() {
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO tasks (
                    task_id, title, status, scheduled_open_at,
                    scheduled_close_at, published_at, created_at, updated_at)
                VALUES (?, '잘못된 과업', 'OPEN', ?, ?, ?, ?, ?)
                """,
                UUID.randomUUID(),
                timestamp(NOW.plusSeconds(10)),
                timestamp(NOW.plusSeconds(100)),
                timestamp(NOW),
                timestamp(NOW),
                timestamp(NOW)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_task_state");
    }

    @Test
    void rejectsDuplicateQuestionOrderWithinTask() {
        UUID taskId = insertDraftTask();
        insertShortTextQuestion(taskId, 1);

        assertThatThrownBy(() -> insertShortTextQuestion(taskId, 1))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_task_question_order");
    }

    @Test
    void restrictsDeletingQuestionReferencedByOption() {
        UUID taskId = insertDraftTask();
        UUID questionId = insertSingleChoiceQuestion(taskId, 1);
        insertOption(taskId, questionId, 1, "A");

        assertThatThrownBy(() -> jdbcTemplate.update(
                "DELETE FROM task_questions WHERE question_id = ?",
                questionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_task_option_question");
    }

    @Test
    void rejectsOptionsAttachedToNonChoiceQuestion() {
        UUID taskId = insertDraftTask();
        UUID questionId = insertShortTextQuestion(taskId, 1);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_options (
                    option_id, task_id, question_id, question_type,
                    kind, content, display_order)
                VALUES (?, ?, ?, 'SINGLE_CHOICE', 'STANDARD', 'A', 1)
                """, UUID.randomUUID(), taskId, questionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_task_option_question");
    }

    @Test
    void rejectsDuplicatePredictionForSameUserTaskAndPersonaGeneration() {
        UUID taskId = insertDraftTask();
        PersonaFixture persona = insertSucceededPersona("user-duplicate");
        insertPendingPrediction("user-duplicate", taskId, persona);

        assertThatThrownBy(() -> insertPendingPrediction(
                "user-duplicate", taskId, persona))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_task_prediction_identity");
    }

    @Test
    void storesPersonaIdentityWithoutDependingOnPersonaTables() {
        UUID taskId = insertDraftTask();
        UUID generationId = UUID.randomUUID();
        String personaId = "external-persona";

        UUID predictionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_predictions (
                    prediction_id, user_id, task_id,
                    persona_generation_id, persona_id, status,
                    candidate_policy_version, requested_candidate_count,
                    attempt_count, created_at)
                VALUES (?, ?, ?, ?, ?, 'PENDING',
                    'policy-v1', 2, 0, ?)
                """,
                predictionId, "user-persona", taskId,
                generationId, personaId, timestamp(NOW));

        Integer personaRows = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM persona_generations
                WHERE generation_id = ?
                """, Integer.class, generationId);
        Integer crossContextForeignKeys = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM pg_constraint constraint_definition
                JOIN pg_class source_table
                  ON source_table.oid = constraint_definition.conrelid
                JOIN pg_class target_table
                  ON target_table.oid = constraint_definition.confrelid
                WHERE constraint_definition.contype = 'f'
                  AND source_table.relname = 'task_predictions'
                  AND target_table.relname = 'persona_generations'
                """, Integer.class);
        var storedIdentity = jdbcTemplate.queryForMap("""
                SELECT persona_generation_id, persona_id
                FROM task_predictions
                WHERE prediction_id = ?
                """, predictionId);
        Integer migrationCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM flyway_schema_history
                WHERE version = '8' AND success = true
                """, Integer.class);

        assertThat(personaRows).isZero();
        assertThat(crossContextForeignKeys).isZero();
        assertThat(storedIdentity)
                .containsEntry("persona_generation_id", generationId)
                .containsEntry("persona_id", personaId);
        assertThat(migrationCount).isEqualTo(1);
    }

    @Test
    void rejectsPredictionColumnsThatContradictStatus() {
        UUID taskId = insertDraftTask();
        PersonaFixture persona = insertSucceededPersona("user-state");

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_predictions (
                    prediction_id, user_id, task_id,
                    persona_generation_id, persona_id, status,
                    candidate_policy_version, requested_candidate_count,
                    attempt_count, created_at)
                VALUES (?, ?, ?, ?, ?, 'PENDING', 'policy-v1', 2, 1, ?)
                """,
                UUID.randomUUID(), "user-state", taskId,
                persona.generationId(), persona.personaId(),
                timestamp(NOW)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_task_prediction_state");
    }

    @Test
    void rejectsCandidateAnswerTypeDifferentFromQuestionType() {
        UUID taskId = insertDraftTask();
        UUID questionId = insertShortTextQuestion(taskId, 1);
        PersonaFixture persona = insertSucceededPersona("user-type");
        UUID predictionId = insertProcessingPrediction(
                "user-type", taskId, persona);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_prediction_candidates (
                    candidate_id, prediction_id, task_id, question_id,
                    candidate_order, answer_type, number_value, rationale)
                VALUES (?, ?, ?, ?, 1, 'NUMBER', 3, '이유')
                """,
                UUID.randomUUID(), predictionId, taskId, questionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "fk_task_prediction_candidate_question");
    }

    @Test
    void rejectsDuplicateCandidateOrderWithinQuestionSlot() {
        UUID taskId = insertDraftTask();
        UUID questionId = insertShortTextQuestion(taskId, 1);
        PersonaFixture persona = insertSucceededPersona("user-candidate");
        UUID predictionId = insertProcessingPrediction(
                "user-candidate", taskId, persona);
        insertShortTextCandidate(
                predictionId, taskId, questionId, 1, "첫 후보");

        assertThatThrownBy(() -> insertShortTextCandidate(
                predictionId, taskId, questionId, 1, "두 번째 후보"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "uq_task_prediction_candidate_question_order");
    }

    @Test
    void rejectsDuplicatePredictionCandidateId() {
        UUID taskId = insertDraftTask();
        UUID questionId = insertShortTextQuestion(taskId, 1);
        PersonaFixture persona = insertSucceededPersona("user-candidate-id");
        UUID predictionId = insertProcessingPrediction(
                "user-candidate-id", taskId, persona);
        UUID candidateId = insertShortTextCandidate(
                predictionId, taskId, questionId, 1, "첫 후보");

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_prediction_candidates (
                    candidate_id, prediction_id, task_id, question_id,
                    candidate_order, answer_type, text_value, rationale)
                VALUES (?, ?, ?, ?, 2, 'SHORT_TEXT', '두 번째 후보', '이유')
                """,
                candidateId, predictionId, taskId, questionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("task_prediction_candidates_pkey");
    }

    @Test
    void rejectsDuplicateAttemptNumberForPrediction() {
        UUID taskId = insertDraftTask();
        PersonaFixture persona = insertSucceededPersona("user-attempt");
        UUID predictionId = insertProcessingPrediction(
                "user-attempt", taskId, persona);
        insertInProgressAttempt(predictionId, 1);

        assertThatThrownBy(() -> insertInProgressAttempt(predictionId, 1))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_task_prediction_attempt_number");
    }

    @Test
    void rejectsSecondSubmissionForSameUserAndTask() {
        UUID taskId = insertDraftTask();
        PersonaFixture firstPersona = insertSucceededPersona("user-submit");
        UUID firstPrediction = insertSucceededPrediction(
                "user-submit", taskId, firstPersona);
        insertSubmission(
                UUID.randomUUID(), "user-submit", taskId,
                firstPersona, firstPrediction);
        PersonaFixture nextPersona = insertSucceededPersonaInActiveRound(
                "persona-source-user");
        UUID nextPrediction = insertSucceededPrediction(
                "user-submit", taskId, nextPersona);

        assertThatThrownBy(() -> insertSubmission(
                UUID.randomUUID(), "user-submit", taskId,
                nextPersona, nextPrediction))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_task_submission_user_task");
    }

    @Test
    void rejectsAdoptedCandidateFromAnotherQuestion() {
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture persona = insertSucceededPersona("user-owner");
        UUID predictionId = insertSucceededPrediction(
                "user-owner", task.taskId(), persona);
        UUID shortCandidateId = insertShortTextCandidate(
                predictionId, task, 1);
        UUID submissionId = UUID.randomUUID();
        insertSubmission(
                submissionId, "user-owner", task.taskId(), persona,
                predictionId);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_submission_answers (
                    submission_id, task_id, prediction_id, question_id,
                    source, adopted_candidate_id, answer_type)
                VALUES (?, ?, ?, ?, 'AI_ACCEPTED', ?, 'SINGLE_CHOICE')
                """,
                submissionId, task.taskId(), predictionId,
                task.singleQuestionId(), shortCandidateId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "fk_task_submission_answer_candidate");
    }

    @Test
    void rejectsDuplicateSubmissionReceiptKeyForUser() {
        UUID key = UUID.randomUUID();
        insertProcessingReceipt("user-receipt", key);

        assertThatThrownBy(() -> insertProcessingReceipt(
                "user-receipt", key))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_task_submission_receipt_key");
    }

    @Test
    void restrictsDeletingSubmissionReferencedByReceipt() {
        UUID taskId = insertDraftTask();
        PersonaFixture persona = insertSucceededPersona("user-delete");
        UUID predictionId = insertSucceededPrediction(
                "user-delete", taskId, persona);
        UUID submissionId = UUID.randomUUID();
        insertSubmission(
                submissionId, "user-delete", taskId, persona,
                predictionId);
        insertSucceededReceipt("user-delete", submissionId);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "DELETE FROM task_submissions WHERE submission_id = ?",
                submissionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "fk_task_submission_receipt_submission");
    }

    @Test
    void rejectsReceiptWhoseUserDoesNotOwnSubmission() {
        UUID taskId = insertDraftTask();
        PersonaFixture persona = insertSucceededPersona("user-owner-receipt");
        UUID predictionId = insertSucceededPrediction(
                "user-owner-receipt", taskId, persona);
        UUID submissionId = UUID.randomUUID();
        insertSubmission(
                submissionId, "user-owner-receipt", taskId, persona,
                predictionId);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_submission_receipts (
                    receipt_id, user_id, idempotency_key, request_hash,
                    status, outcome_schema_version, http_status, outcome,
                    submission_id, created_at, completed_at)
                VALUES (?, 'another-user', ?, ?, 'SUCCEEDED', 1, 201,
                    CAST(? AS jsonb), ?, ?, ?)
                """,
                UUID.randomUUID(), UUID.randomUUID(), new byte[32],
                "{\"created\":true}", submissionId,
                timestamp(NOW), timestamp(NOW.plusSeconds(1))))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "fk_task_submission_receipt_submission");
    }

    private TaskFixture insertOpenTaskWithQuestions() {
        UUID taskId = UUID.randomUUID();
        Timestamp createdAt = timestamp(NOW);
        Timestamp publishedAt = timestamp(NOW.plusSeconds(1));
        Timestamp openedAt = timestamp(NOW.plusSeconds(2));
        Timestamp closeAt = timestamp(NOW.plusSeconds(3_600));
        jdbcTemplate.update("""
                INSERT INTO tasks (
                    task_id, title, description, status,
                    scheduled_open_at, scheduled_close_at,
                    published_at, opened_at, created_at, updated_at)
                VALUES (?, '통합 테스트 과업', '설명', 'OPEN',
                    ?, ?, ?, ?, ?, ?)
                """,
                taskId, openedAt, closeAt, publishedAt, openedAt,
                createdAt, openedAt);
        jdbcTemplate.update("""
                INSERT INTO task_lifecycle_history (
                    history_id, task_id, event_type,
                    previous_status, new_status,
                    new_scheduled_open_at, new_scheduled_close_at,
                    trigger, actor_id, occurred_at)
                VALUES (?, ?, 'OPENED', 'DRAFT', 'OPEN', ?, ?,
                    'ADMIN', 'admin', ?)
                """,
                UUID.randomUUID(), taskId, openedAt, closeAt, openedAt);
        UUID singleQuestionId = insertSingleChoiceQuestion(taskId, 1);
        UUID firstOptionId = insertOption(
                taskId, singleQuestionId, 1, "A");
        UUID secondOptionId = insertOption(
                taskId, singleQuestionId, 2, "B");
        UUID shortQuestionId = insertShortTextQuestion(taskId, 2);
        return new TaskFixture(
                taskId, singleQuestionId, shortQuestionId,
                firstOptionId, secondOptionId);
    }

    private UUID insertDraftTask() {
        UUID taskId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO tasks (
                    task_id, title, status, created_at, updated_at)
                VALUES (?, '초안 과업', 'DRAFT', ?, ?)
                """, taskId, timestamp(NOW), timestamp(NOW));
        return taskId;
    }

    private UUID insertSingleChoiceQuestion(UUID taskId, int order) {
        UUID questionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_questions (
                    question_id, task_id, type, content, display_order)
                VALUES (?, ?, 'SINGLE_CHOICE', ?, ?)
                """, questionId, taskId, "단일 질문 " + order, order);
        return questionId;
    }

    private UUID insertShortTextQuestion(UUID taskId, int order) {
        UUID questionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_questions (
                    question_id, task_id, type, content,
                    display_order, text_max_length)
                VALUES (?, ?, 'SHORT_TEXT', ?, ?, 500)
                """, questionId, taskId, "단답 질문 " + order, order);
        return questionId;
    }

    private UUID insertOption(
            UUID taskId,
            UUID questionId,
            int order,
            String content
    ) {
        UUID optionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_options (
                    option_id, task_id, question_id, question_type,
                    kind, content, display_order)
                VALUES (?, ?, ?, 'SINGLE_CHOICE', 'STANDARD', ?, ?)
                """, optionId, taskId, questionId, content, order);
        return optionId;
    }

    private PersonaFixture insertSucceededPersona(String userId) {
        long version = SURVEY_VERSION.incrementAndGet();
        UUID contentId = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        Timestamp createdAt = timestamp(NOW.minusSeconds(100));

        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, ?, 'admin', ?, 'admin', ?,
                    'admin', ?)
                """, contentId, version, "Survey " + version,
                createdAt, createdAt, createdAt);
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    enforcement_mode, activated_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'ACTIVE', 'REQUIRED', ?, 'admin', ?, 0)
                """, roundId, version, contentId, createdAt, createdAt);
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id,
                    content_version_id, submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """, responseId, userId, roundId, contentId, createdAt);
        return insertSucceededPersonaGeneration(responseId);
    }

    private PersonaFixture insertSucceededPersonaInActiveRound(
            String responseUserId
    ) {
        UUID roundId = jdbcTemplate.queryForObject("""
                SELECT round_id
                FROM survey_rounds
                WHERE status = 'ACTIVE'
                """, UUID.class);
        UUID contentId = jdbcTemplate.queryForObject("""
                SELECT content_version_id
                FROM survey_rounds
                WHERE round_id = ?
                """, UUID.class, roundId);
        UUID responseId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id,
                    content_version_id, submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                responseId, responseUserId, roundId, contentId,
                timestamp(NOW.minusSeconds(80)));
        return insertSucceededPersonaGeneration(responseId);
    }

    private PersonaFixture insertSucceededPersonaGeneration(
            UUID responseId
    ) {
        UUID generationId = UUID.randomUUID();
        String personaId = "persona-" + generationId;
        Timestamp createdAt = timestamp(NOW.minusSeconds(100));
        Timestamp startedAt = timestamp(NOW.minusSeconds(90));
        Timestamp completedAt = timestamp(NOW.minusSeconds(80));
        jdbcTemplate.update("""
                INSERT INTO persona_generations (
                    generation_id, source_type, source_id, persona_id, status,
                    attempt_count, created_at, processing_started_at,
                    completed_at, updated_at)
                VALUES (?, 'SURVEY_RESPONSE', ?, ?, 'SUCCEEDED', 1, ?, ?, ?, ?)
                """,
                generationId, responseId, personaId,
                createdAt, startedAt, completedAt, completedAt);
        return new PersonaFixture(generationId, personaId);
    }

    private UUID insertPendingPrediction(
            String userId,
            UUID taskId,
            PersonaFixture persona
    ) {
        UUID predictionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_predictions (
                    prediction_id, user_id, task_id,
                    persona_generation_id, persona_id, status,
                    candidate_policy_version, requested_candidate_count,
                    attempt_count, created_at)
                VALUES (?, ?, ?, ?, ?, 'PENDING', 'policy-v1', 2, 0, ?)
                """,
                predictionId, userId, taskId,
                persona.generationId(), persona.personaId(), timestamp(NOW));
        return predictionId;
    }

    private UUID insertProcessingPrediction(
            String userId,
            UUID taskId,
            PersonaFixture persona
    ) {
        UUID predictionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_predictions (
                    prediction_id, user_id, task_id,
                    persona_generation_id, persona_id, status,
                    candidate_policy_version, requested_candidate_count,
                    attempt_count, created_at, started_at)
                VALUES (?, ?, ?, ?, ?, 'PROCESSING', 'policy-v1', 2, 1,
                    ?, ?)
                """,
                predictionId, userId, taskId,
                persona.generationId(), persona.personaId(),
                timestamp(NOW), timestamp(NOW.plusSeconds(1)));
        return predictionId;
    }

    private UUID insertSucceededPrediction(
            String userId,
            UUID taskId,
            PersonaFixture persona
    ) {
        UUID predictionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_predictions (
                    prediction_id, user_id, task_id,
                    persona_generation_id, persona_id, status,
                    candidate_policy_version, requested_candidate_count,
                    attempt_count, created_at, started_at, completed_at)
                VALUES (?, ?, ?, ?, ?, 'SUCCEEDED', 'policy-v1', 1, 1,
                    ?, ?, ?)
                """,
                predictionId, userId, taskId,
                persona.generationId(), persona.personaId(),
                timestamp(NOW), timestamp(NOW.plusSeconds(1)),
                timestamp(NOW.plusSeconds(2)));
        return predictionId;
    }

    private CandidateFixture insertSingleChoiceCandidate(
            UUID predictionId,
            TaskFixture task,
            UUID optionId,
            int order
    ) {
        UUID candidateId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_prediction_candidates (
                    candidate_id, prediction_id, task_id, question_id,
                    candidate_order, slot_option_id, answer_type, rationale)
                VALUES (?, ?, ?, ?, ?, ?, 'SINGLE_CHOICE', ?)
                """,
                candidateId, predictionId, task.taskId(),
                task.singleQuestionId(), order, optionId,
                "선택 이유 " + optionId);
        jdbcTemplate.update("""
                INSERT INTO task_prediction_candidate_selections (
                    selection_id, candidate_id, prediction_id,
                    task_id, question_id, answer_type,
                    option_id, option_kind)
                VALUES (?, ?, ?, ?, ?, 'SINGLE_CHOICE', ?, 'STANDARD')
                """,
                UUID.randomUUID(), candidateId, predictionId,
                task.taskId(), task.singleQuestionId(), optionId);
        return new CandidateFixture(candidateId);
    }

    private UUID insertShortTextCandidate(
            UUID predictionId,
            TaskFixture task,
            int order
    ) {
        return insertShortTextCandidate(
                predictionId, task.taskId(), task.shortQuestionId(),
                order, "예상 답변");
    }

    private UUID insertShortTextCandidate(
            UUID predictionId,
            UUID taskId,
            UUID questionId,
            int order,
            String value
    ) {
        UUID candidateId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_prediction_candidates (
                    candidate_id, prediction_id, task_id, question_id,
                    candidate_order, answer_type, text_value, rationale)
                VALUES (?, ?, ?, ?, ?, 'SHORT_TEXT', ?, ?)
                """,
                candidateId, predictionId, taskId, questionId,
                order, value, "텍스트 이유 " + candidateId);
        return candidateId;
    }

    private void insertInProgressAttempt(
            UUID predictionId,
            int attemptNumber
    ) {
        jdbcTemplate.update("""
                INSERT INTO task_prediction_attempts (
                    attempt_id, prediction_id, attempt_number, request_id,
                    request_payload, requested_at, outcome)
                VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, 'IN_PROGRESS')
                """,
                UUID.randomUUID(), predictionId, attemptNumber,
                predictionId, "{\"request\":true}", timestamp(NOW));
    }

    private void insertSuccessfulAttempt(
            UUID predictionId,
            int attemptNumber
    ) {
        jdbcTemplate.update("""
                INSERT INTO task_prediction_attempts (
                    attempt_id, prediction_id, attempt_number, request_id,
                    request_payload, requested_at, responded_at, outcome,
                    http_status, response_payload)
                VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?, 'SUCCEEDED',
                    200, CAST(? AS jsonb))
                """,
                UUID.randomUUID(), predictionId, attemptNumber,
                predictionId, "{\"request\":true}", timestamp(NOW),
                timestamp(NOW.plusSeconds(1)), "{\"ok\":true}");
    }

    private void insertSubmission(
            UUID submissionId,
            String userId,
            UUID taskId,
            PersonaFixture persona,
            UUID predictionId
    ) {
        jdbcTemplate.update("""
                INSERT INTO task_submissions (
                    submission_id, user_id, task_id,
                    persona_generation_id, prediction_id, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                submissionId, userId, taskId, persona.generationId(),
                predictionId, timestamp(NOW.plusSeconds(10)));
    }

    private void insertAiAcceptedAnswer(
            UUID submissionId,
            UUID predictionId,
            TaskFixture task,
            UUID candidateId
    ) {
        jdbcTemplate.update("""
                INSERT INTO task_submission_answers (
                    submission_id, task_id, prediction_id, question_id,
                    source, adopted_candidate_id, answer_type)
                VALUES (?, ?, ?, ?, 'AI_ACCEPTED', ?, 'SINGLE_CHOICE')
                """,
                submissionId, task.taskId(), predictionId,
                task.singleQuestionId(), candidateId);
        jdbcTemplate.update("""
                INSERT INTO task_submission_answer_selections (
                    submission_id, task_id, prediction_id, question_id,
                    answer_type, option_id, option_kind)
                VALUES (?, ?, ?, ?, 'SINGLE_CHOICE', ?, 'STANDARD')
                """,
                submissionId, task.taskId(), predictionId,
                task.singleQuestionId(), task.firstOptionId());
    }

    private void insertDirectShortTextAnswer(
            UUID submissionId,
            UUID predictionId,
            TaskFixture task,
            String value
    ) {
        jdbcTemplate.update("""
                INSERT INTO task_submission_answers (
                    submission_id, task_id, prediction_id, question_id,
                    source, answer_type, text_value)
                VALUES (?, ?, ?, ?, 'USER_ANSWERED', 'SHORT_TEXT', ?)
                """,
                submissionId, task.taskId(), predictionId,
                task.shortQuestionId(), value);
    }

    private void insertProcessingReceipt(String userId, UUID key) {
        jdbcTemplate.update("""
                INSERT INTO task_submission_receipts (
                    receipt_id, user_id, idempotency_key, request_hash,
                    status, outcome_schema_version, created_at)
                VALUES (?, ?, ?, ?, 'PROCESSING', 1, ?)
                """,
                UUID.randomUUID(), userId, key, new byte[32],
                timestamp(NOW));
    }

    private void insertSucceededReceipt(
            String userId,
            UUID submissionId
    ) {
        jdbcTemplate.update("""
                INSERT INTO task_submission_receipts (
                    receipt_id, user_id, idempotency_key, request_hash,
                    status, outcome_schema_version, http_status, outcome,
                    submission_id, created_at, completed_at)
                VALUES (?, ?, ?, ?, 'SUCCEEDED', 1, 201,
                    CAST(? AS jsonb), ?, ?, ?)
                """,
                UUID.randomUUID(), userId, UUID.randomUUID(), new byte[32],
                "{\"created\":true}", submissionId,
                timestamp(NOW), timestamp(NOW.plusSeconds(1)));
    }

    private static Timestamp timestamp(Instant value) {
        return Timestamp.from(value);
    }

    private record PersonaFixture(UUID generationId, String personaId) {
    }

    private record CandidateFixture(UUID candidateId) {
    }

    private record TaskFixture(
            UUID taskId,
            UUID singleQuestionId,
            UUID shortQuestionId,
            UUID firstOptionId,
            UUID secondOptionId
    ) {
    }
}
