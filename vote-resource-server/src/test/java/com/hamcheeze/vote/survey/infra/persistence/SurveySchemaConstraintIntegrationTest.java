package com.hamcheeze.vote.survey.infra.persistence;

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
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class SurveySchemaConstraintIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-01-01T00:00:00Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void migratesTheCompleteSchemaAndCreatesTheGlobalRoundControl() {
        List<String> expectedTables = List.of(
                "survey_content_versions",
                "survey_question_sections",
                "survey_questions",
                "survey_question_items",
                "survey_options",
                "survey_consent_documents",
                "survey_consent_receipts",
                "survey_round_control",
                "survey_rounds",
                "survey_round_transitions",
                "survey_responses",
                "survey_answers",
                "survey_answer_selections",
                "survey_answer_item_values",
                "survey_idempotency_receipts",
                "survey_response_submitted_replays",
                "persona_generations");

        List<String> actualTables = jdbcTemplate.queryForList("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND (table_name LIKE 'survey_%'
                    OR table_name = 'persona_generations')
                """, String.class);
        Integer controlCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM survey_round_control
                WHERE control_id = 'GLOBAL' AND row_version = 0
                """, Integer.class);

        assertThat(actualTables)
                .containsExactlyInAnyOrderElementsOf(expectedTables);
        assertThat(controlCount).isEqualTo(1);
    }

    @Test
    void rejectsASecondActiveRound() {
        UUID contentId = insertPublishedContent(1);
        insertActiveRound(contentId, 1);

        assertThatThrownBy(() -> insertActiveRound(contentId, 2))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_survey_round_one_active");
    }

    @Test
    void rejectsASecondScheduledRound() {
        UUID contentId = insertPublishedContent(1);
        insertScheduledRound(contentId, 1);

        assertThatThrownBy(() -> insertScheduledRound(contentId, 2))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_survey_round_one_scheduled");
    }

    @Test
    void rejectsAQuestionUsingASectionFromAnotherContentVersion() {
        UUID sectionContentId = insertPublishedContent(1);
        UUID questionContentId = insertPublishedContent(2);
        UUID sectionId = insertQuestionSection(sectionContentId, 1);
        UUID questionId = UUID.randomUUID();

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO survey_questions (
                    question_id, content_version_id, question_lineage_id,
                    section_id, question_key, source_number, title,
                    type, prompt, display_order, is_required)
                VALUES (?, ?, ?, ?, ?, '1', '질문',
                    'SINGLE_CHOICE', '질문', 1, true)
                """, questionId, questionContentId, UUID.randomUUID(),
                sectionId, "test.question." + questionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_survey_question_section");
    }

    @Test
    void rejectsASecondResponseForTheSameUserAndRound() {
        UUID contentId = insertPublishedContent(1);
        UUID roundId = insertActiveRound(contentId, 1);
        insertResponse("user-a", roundId, contentId);

        assertThatThrownBy(() ->
                insertResponse("user-a", roundId, contentId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uq_survey_response_user_round");
    }

    @Test
    void rejectsAnAnswerThatMixesAQuestionFromAnotherContentVersion() {
        UUID firstContentId = insertPublishedContent(1);
        UUID foreignQuestionId = insertSingleChoiceQuestion(
                firstContentId, 1);
        UUID currentContentId = insertPublishedContent(2);
        UUID roundId = insertActiveRound(currentContentId, 1);
        UUID responseId = insertResponse(
                "user-a", roundId, currentContentId);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO survey_answers (
                    answer_id, response_id, content_version_id,
                    question_id, answer_type)
                VALUES (?, ?, ?, ?, 'SINGLE_CHOICE')
                """, UUID.randomUUID(), responseId, currentContentId,
                foreignQuestionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_survey_answer_question");
    }

    @Test
    void rejectsASelectionThatMixesAnOptionFromAnotherQuestion() {
        UUID contentId = insertPublishedContent(1);
        UUID firstQuestionId = insertSingleChoiceQuestion(contentId, 1);
        UUID secondQuestionId = insertSingleChoiceQuestion(contentId, 2);
        UUID foreignOptionId = insertOption(
                firstQuestionId, contentId, 1);
        UUID roundId = insertActiveRound(contentId, 1);
        UUID responseId = insertResponse("user-a", roundId, contentId);
        UUID answerId = insertChoiceAnswer(
                responseId, contentId, secondQuestionId);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO survey_answer_selections (
                    selection_id, answer_id, response_id,
                    content_version_id, question_id, option_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), answerId, responseId, contentId,
                secondQuestionId, foreignOptionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_survey_answer_selection_option");
    }

    @Test
    void rejectsDuplicateOptionLocalKeyWithinAQuestion() {
        UUID contentId = insertPublishedContent(1);
        UUID questionId = insertSingleChoiceQuestion(contentId, 1);
        insertOption(questionId, contentId, 1);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO survey_options (
                    option_id, question_id, content_version_id,
                    option_lineage_id, option_local_key,
                    kind, label, display_order)
                VALUES (?, ?, ?, ?, 'A', 'STANDARD', '다른 선택지', 2)
                """, UUID.randomUUID(), questionId, contentId,
                UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "uq_survey_option_question_local_key");
    }

    @Test
    void rejectsRuleColumnsThatDoNotMatchTheQuestionType() {
        UUID contentId = insertPublishedContent(1);
        UUID sectionId = insertQuestionSection(contentId, 1);
        UUID questionId = UUID.randomUUID();

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO survey_questions (
                    question_id, content_version_id, question_lineage_id,
                    section_id, question_key, source_number, title,
                    type, prompt, display_order, is_required,
                    text_max_length)
                VALUES (?, ?, ?, ?, ?, '1', '질문',
                    'SINGLE_CHOICE', '질문', 1, true, 200)
                """, questionId, contentId, UUID.randomUUID(),
                sectionId, "test.question." + questionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_survey_question_rules");
    }

    @Test
    void requiresEverySurveyQuestionAtTheDatabaseBoundary() {
        UUID contentId = insertPublishedContent(1);
        UUID defaultedQuestionId = UUID.randomUUID();
        UUID firstSectionId = insertQuestionSection(contentId, 1);
        jdbcTemplate.update("""
                INSERT INTO survey_questions (
                    question_id, content_version_id, question_lineage_id,
                    section_id, question_key, source_number, title,
                    type, prompt, display_order, text_max_length)
                VALUES (?, ?, ?, ?, ?, '1', '기본 필수 질문',
                    'SHORT_TEXT', '기본 필수 질문', 1, 200)
                """, defaultedQuestionId, contentId, UUID.randomUUID(),
                firstSectionId, "test.question." + defaultedQuestionId);
        Boolean defaultedRequired = jdbcTemplate.queryForObject("""
                SELECT is_required
                FROM survey_questions
                WHERE question_id = ?
                """, Boolean.class, defaultedQuestionId);
        Integer migrationCount = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM flyway_schema_history
                WHERE version = '9' AND success = true
                """, Integer.class);

        UUID secondSectionId = insertQuestionSection(contentId, 2);
        UUID secondQuestionId = UUID.randomUUID();
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO survey_questions (
                    question_id, content_version_id, question_lineage_id,
                    section_id, question_key, source_number, title,
                    type, prompt, display_order, is_required,
                    text_max_length)
                VALUES (?, ?, ?, ?, ?, '2', '질문',
                    'SHORT_TEXT', '질문', 2, false, 200)
                """, secondQuestionId, contentId, UUID.randomUUID(),
                secondSectionId, "test.question." + secondQuestionId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_survey_question_required");

        assertThat(defaultedRequired).isTrue();
        assertThat(migrationCount).isEqualTo(1);
    }

    private UUID insertPublishedContent(long versionNumber) {
        UUID contentId = UUID.randomUUID();
        Timestamp timestamp = Timestamp.from(NOW);
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, ?, 'admin', ?, 'admin', ?,
                    'admin', ?)
                """, contentId, versionNumber,
                "Survey " + versionNumber, timestamp, timestamp,
                timestamp);
        return contentId;
    }

    private UUID insertSingleChoiceQuestion(
            UUID contentId,
            int displayOrder
    ) {
        UUID questionId = UUID.randomUUID();
        UUID sectionId = insertQuestionSection(contentId, displayOrder);
        jdbcTemplate.update("""
                INSERT INTO survey_questions (
                    question_id, content_version_id, question_lineage_id,
                    section_id, question_key, source_number, title,
                    type, prompt, display_order, is_required)
                VALUES (?, ?, ?, ?, ?, ?, ?,
                    'SINGLE_CHOICE', ?, ?, true)
                """, questionId, contentId, UUID.randomUUID(),
                sectionId, "test.question." + questionId,
                Integer.toString(displayOrder), "질문 " + displayOrder,
                "질문 " + displayOrder, displayOrder);
        return questionId;
    }

    private UUID insertQuestionSection(
            UUID contentId,
            int displayOrder
    ) {
        UUID sectionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_question_sections (
                    section_id, content_version_id, section_lineage_id,
                    section_key, title, display_order)
                VALUES (?, ?, ?, ?, ?, ?)
                """, sectionId, contentId, UUID.randomUUID(),
                "test.section." + sectionId,
                "섹션 " + displayOrder, displayOrder);
        return sectionId;
    }

    private UUID insertOption(
            UUID questionId,
            UUID contentId,
            int displayOrder
    ) {
        UUID optionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_options (
                    option_id, question_id, content_version_id,
                    option_lineage_id, option_local_key,
                    kind, label, display_order)
                VALUES (?, ?, ?, ?, ?, 'STANDARD', ?, ?)
                """, optionId, questionId, contentId, UUID.randomUUID(),
                com.hamcheeze.vote.survey.domain.content.SurveyOption
                        .localKeyForDisplayOrder(displayOrder),
                "선택지 " + displayOrder, displayOrder);
        return optionId;
    }

    private UUID insertActiveRound(UUID contentId, long roundNumber) {
        UUID roundId = UUID.randomUUID();
        Timestamp timestamp = Timestamp.from(NOW);
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    enforcement_mode, activated_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'ACTIVE', 'REQUIRED', ?, 'admin', ?, 0)
                """, roundId, roundNumber, contentId, timestamp, timestamp);
        return roundId;
    }

    private UUID insertScheduledRound(UUID contentId, long roundNumber) {
        UUID roundId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    scheduled_at, created_by, created_at, row_version)
                VALUES (?, ?, ?, 'SCHEDULED', ?, 'admin', ?, 0)
                """, roundId, roundNumber, contentId,
                Timestamp.from(NOW.plus(1, ChronoUnit.DAYS)),
                Timestamp.from(NOW));
        return roundId;
    }

    private UUID insertResponse(
            String userId,
            UUID roundId,
            UUID contentId
    ) {
        UUID responseId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id,
                    content_version_id, submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """, responseId, userId, roundId, contentId,
                Timestamp.from(NOW.plus(1, ChronoUnit.MINUTES)));
        return responseId;
    }

    private UUID insertChoiceAnswer(
            UUID responseId,
            UUID contentId,
            UUID questionId
    ) {
        UUID answerId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_answers (
                    answer_id, response_id, content_version_id,
                    question_id, answer_type)
                VALUES (?, ?, ?, ?, 'SINGLE_CHOICE')
                """, answerId, responseId, contentId, questionId);
        return answerId;
    }
}
