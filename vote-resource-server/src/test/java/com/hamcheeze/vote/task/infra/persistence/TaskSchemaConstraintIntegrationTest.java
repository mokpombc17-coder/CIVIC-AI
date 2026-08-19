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
    void migratesCurrentTaskSchema() {
        List<String> expectedTables = List.of(
                "tasks",
                "task_questions",
                "task_options",
                "task_lifecycle_history",
                "task_predictions",
                "task_predicted_reasons",
                "task_prediction_attempts",
                "task_submissions",
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
                WHERE version = '14' AND success = true
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
                predictionId, task, task.firstOptionId(), 2);
        insertSingleChoiceCandidate(
                predictionId, task, task.secondOptionId(), 1);
        insertSingleChoiceCandidate(
                predictionId, task, task.secondOptionId(), 2);
        insertSuccessfulAttempt(predictionId, 1);

        UUID submissionId = UUID.randomUUID();
        insertAiAcceptedSubmission(
                submissionId, "user-valid", task.taskId(), persona,
                predictionId, task.singleQuestionId(), task.firstOptionId(),
                selected.candidateId());
        insertSucceededReceipt("user-valid", submissionId);

        Integer tasks = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM tasks WHERE task_id = ?",
                Integer.class, task.taskId());
        Integer candidates = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM task_predicted_reasons "
                        + "WHERE prediction_id = ?",
                Integer.class, predictionId);
        String finalReason = jdbcTemplate.queryForObject(
                "SELECT final_reason FROM task_submissions "
                        + "WHERE submission_id = ?",
                String.class, submissionId);

        assertThat(tasks).isEqualTo(1);
        assertThat(candidates).isEqualTo(4);
        assertThat(finalReason).startsWith("선택 이유");
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
    void rejectsSecondQuestionWithinTask() {
        UUID taskId = insertDraftTask();
        insertSingleChoiceQuestion(taskId, 1);

        assertThatThrownBy(() -> insertSingleChoiceQuestion(taskId, 2))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_task_question_order");
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
    void rejectsNonSingleChoiceQuestion() {
        UUID taskId = insertDraftTask();

        assertThatThrownBy(() -> insertShortTextQuestion(taskId, 1))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_task_question_type");
    }

    @Test
    void rejectsOtherOption() {
        UUID taskId = insertDraftTask();
        UUID questionId = insertSingleChoiceQuestion(taskId, 1);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_options (
                    option_id, task_id, question_id, question_type,
                    kind, content, display_order)
                VALUES (?, ?, ?, 'SINGLE_CHOICE', 'OTHER', '기타', 1)
                """, UUID.randomUUID(), taskId, questionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_task_option_kind");
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
        UUID versionId = UUID.randomUUID();
        String personaId = "external-persona";

        UUID predictionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_predictions (
                    prediction_id, user_id, task_id,
                    persona_generation_id, persona_version_id,
                    persona_id, status,
                    candidate_policy_version,
                    attempt_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING',
                    'policy-v1', 0, ?)
                """,
                predictionId, "user-persona", taskId,
                generationId, versionId, personaId, timestamp(NOW));

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
                  AND target_table.relname LIKE 'persona_%'
                """, Integer.class);
        var storedIdentity = jdbcTemplate.queryForMap("""
                SELECT persona_generation_id, persona_version_id, persona_id
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
                .containsEntry("persona_version_id", versionId)
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
                    persona_generation_id, persona_version_id,
                    persona_id, status,
                    candidate_policy_version,
                    attempt_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'policy-v1', 1, ?)
                """,
                UUID.randomUUID(), "user-state", taskId,
                persona.generationId(), persona.versionId(),
                persona.personaId(),
                timestamp(NOW)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_task_prediction_state");
    }

    @Test
    void rejectsPredictedReasonForMissingOption() {
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture persona = insertSucceededPersona("user-type");
        UUID predictionId = insertProcessingPrediction(
                "user-type", task.taskId(), persona);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_predicted_reasons (
                    predicted_reason_id, prediction_id, option_id,
                    reason_order, reason)
                VALUES (?, ?, ?, 1, '이유')
                """,
                UUID.randomUUID(), predictionId, UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_task_predicted_reason_option");
    }

    @Test
    void rejectsDuplicateCandidateOrderWithinQuestionSlot() {
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture persona = insertSucceededPersona("user-candidate");
        UUID predictionId = insertProcessingPrediction(
                "user-candidate", task.taskId(), persona);
        insertSingleChoiceCandidate(
                predictionId, task, task.firstOptionId(), 1);

        assertThatThrownBy(() -> insertSingleChoiceCandidate(
                predictionId, task, task.firstOptionId(), 1))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "uq_task_predicted_reason_option_order");
    }

    @Test
    void rejectsDuplicatePredictedReasonId() {
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture persona = insertSucceededPersona("user-candidate-id");
        UUID predictionId = insertProcessingPrediction(
                "user-candidate-id", task.taskId(), persona);
        UUID candidateId = insertSingleChoiceCandidate(
                predictionId, task, task.firstOptionId(), 1).candidateId();

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_predicted_reasons (
                    predicted_reason_id, prediction_id, option_id,
                    reason_order, reason)
                VALUES (?, ?, ?, 2, '두 번째 이유')
                """,
                candidateId, predictionId, task.firstOptionId()))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("task_predicted_reasons_pkey");
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
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture firstPersona = insertSucceededPersona("user-submit");
        UUID firstPrediction = insertSucceededPrediction(
                "user-submit", task.taskId(), firstPersona);
        insertSubmission(
                UUID.randomUUID(), "user-submit", task.taskId(),
                firstPersona, firstPrediction);
        PersonaFixture nextPersona = insertSucceededPersonaInActiveRound(
                "persona-source-user");
        UUID nextPrediction = insertSucceededPrediction(
                "user-submit", task.taskId(), nextPersona);

        assertThatThrownBy(() -> insertSubmission(
                UUID.randomUUID(), "user-submit", task.taskId(),
                nextPersona, nextPrediction))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_task_submission_user_task");
    }

    @Test
    void rejectsAcceptedReasonFromAnotherSelectedOption() {
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture persona = insertSucceededPersona("user-owner");
        UUID predictionId = insertSucceededPrediction(
                "user-owner", task.taskId(), persona);
        UUID firstOptionReasonId = insertSingleChoiceCandidate(
                predictionId, task, task.firstOptionId(), 1).candidateId();

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO task_submissions (
                    submission_id, user_id, task_id,
                    persona_generation_id, persona_version_id,
                    prediction_id, question_id, selected_option_id,
                    reason_source, accepted_predicted_reason_id,
                    final_reason, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AI_ACCEPTED', ?, ?, ?)
                """,
                UUID.randomUUID(), "user-owner", task.taskId(),
                persona.generationId(), persona.versionId(), predictionId,
                task.singleQuestionId(), task.secondOptionId(),
                firstOptionReasonId, "다른 선택지의 이유",
                timestamp(NOW.plusSeconds(10))))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "fk_task_submission_accepted_reason");
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
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture persona = insertSucceededPersona("user-delete");
        UUID predictionId = insertSucceededPrediction(
                "user-delete", task.taskId(), persona);
        UUID submissionId = UUID.randomUUID();
        insertSubmission(
                submissionId, "user-delete", task.taskId(), persona,
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
        TaskFixture task = insertOpenTaskWithQuestions();
        PersonaFixture persona = insertSucceededPersona("user-owner-receipt");
        UUID predictionId = insertSucceededPrediction(
                "user-owner-receipt", task.taskId(), persona);
        UUID submissionId = UUID.randomUUID();
        insertSubmission(
                submissionId, "user-owner-receipt", task.taskId(), persona,
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
        return new TaskFixture(
                taskId, singleQuestionId, firstOptionId, secondOptionId);
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
        return new PersonaFixture(
                generationId, UUID.randomUUID(), personaId);
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
                    persona_generation_id, persona_version_id,
                    persona_id, status,
                    candidate_policy_version,
                    attempt_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'policy-v1', 0, ?)
                """,
                predictionId, userId, taskId,
                persona.generationId(), persona.versionId(),
                persona.personaId(), timestamp(NOW));
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
                    persona_generation_id, persona_version_id,
                    persona_id, status,
                    candidate_policy_version,
                    attempt_count, created_at, started_at)
                VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING', 'policy-v1', 1,
                    ?, ?)
                """,
                predictionId, userId, taskId,
                persona.generationId(), persona.versionId(),
                persona.personaId(),
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
                    persona_generation_id, persona_version_id,
                    persona_id, status,
                    candidate_policy_version,
                    attempt_count, created_at, started_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, 'SUCCEEDED', 'policy-v1', 1,
                    ?, ?, ?)
                """,
                predictionId, userId, taskId,
                persona.generationId(), persona.versionId(),
                persona.personaId(),
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
                INSERT INTO task_predicted_reasons (
                    predicted_reason_id, prediction_id, option_id,
                    reason_order, reason)
                VALUES (?, ?, ?, ?, ?)
                """,
                candidateId, predictionId, optionId, order,
                "선택 이유 " + optionId);
        return new CandidateFixture(candidateId);
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
        UUID questionId = jdbcTemplate.queryForObject("""
                SELECT question_id
                FROM task_options
                WHERE task_id = ?
                ORDER BY display_order
                LIMIT 1
                """, UUID.class, taskId);
        UUID optionId = jdbcTemplate.queryForObject("""
                SELECT option_id
                FROM task_options
                WHERE task_id = ? AND question_id = ?
                ORDER BY display_order
                LIMIT 1
                """, UUID.class, taskId, questionId);
        jdbcTemplate.update("""
                INSERT INTO task_submissions (
                    submission_id, user_id, task_id,
                    persona_generation_id, persona_version_id,
                    prediction_id, question_id, selected_option_id,
                    reason_source, final_reason, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USER_WRITTEN', ?, ?)
                """,
                submissionId, userId, taskId, persona.generationId(),
                persona.versionId(), predictionId, questionId, optionId,
                "직접 작성한 이유",
                timestamp(NOW.plusSeconds(10)));
    }

    private void insertAiAcceptedSubmission(
            UUID submissionId,
            String userId,
            UUID taskId,
            PersonaFixture persona,
            UUID predictionId,
            UUID questionId,
            UUID optionId,
            UUID predictedReasonId
    ) {
        jdbcTemplate.update("""
                INSERT INTO task_submissions (
                    submission_id, user_id, task_id,
                    persona_generation_id, persona_version_id,
                    prediction_id, question_id, selected_option_id,
                    reason_source, accepted_predicted_reason_id,
                    final_reason, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AI_ACCEPTED', ?, ?, ?)
                """,
                submissionId, userId, taskId, persona.generationId(),
                persona.versionId(), predictionId, questionId, optionId,
                predictedReasonId, "선택 이유 " + optionId,
                timestamp(NOW.plusSeconds(10)));
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

    private record PersonaFixture(
            UUID generationId,
            UUID versionId,
            String personaId
    ) {
    }

    private record CandidateFixture(UUID candidateId) {
    }

    private record TaskFixture(
            UUID taskId,
            UUID singleQuestionId,
            UUID firstOptionId,
            UUID secondOptionId
    ) {
    }
}
