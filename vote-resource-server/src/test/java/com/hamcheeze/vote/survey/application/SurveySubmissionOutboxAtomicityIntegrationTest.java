package com.hamcheeze.vote.survey.application;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService;
import com.hamcheeze.vote.survey.application.round.SurveyRoundService;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
class SurveySubmissionOutboxAtomicityIntegrationTest {

    private static final SurveyActorId ADMIN = new SurveyActorId("admin");
    private static final SurveyUserId USER = new SurveyUserId("user-a");

    @Autowired
    private SurveyContentVersionService contents;

    @Autowired
    private SurveyRoundService rounds;

    @Autowired
    private SurveyResponseSubmissionService submissions;

    @MockitoSpyBean
    private IntegrationOutboxRepository outbox;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetSurveyData() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    integration_outbox,
                    persona_inbox,
                    survey_content_versions,
                    survey_round_control
                CASCADE
                """);
        jdbcTemplate.update("""
                INSERT INTO survey_round_control (control_id, row_version)
                VALUES ('GLOBAL', 0)
                """);
    }

    @AfterEach
    void cleanSurveyData() {
        resetSurveyData();
    }

    @Test
    void outboxFailureRollsBackResponseAndReceiptTogether() {
        SurveyQuestion question = new SurveyQuestion(
                new SurveyQuestionId(UUID.randomUUID()),
                new SurveyQuestionLineageKey(UUID.randomUUID()),
                SurveyQuestionType.SHORT_TEXT,
                "자신을 표현해주세요.",
                null,
                1,
                true,
                ShortTextRule.defaults(),
                List.of());
        var draft = contents.createDraft(
                new SurveyContentVersionService.CreateDraftCommand(
                        "atomicity", null, List.of(question)),
                ADMIN);
        var published = contents.publish(draft.id(), ADMIN).contentVersion();
        var active = rounds.startPublishedContentNow(
                        published.id(), null, ADMIN)
                .targetRound();
        doThrow(new IllegalStateException("forced outbox failure"))
                .when(outbox).insert(any());

        assertThatThrownBy(() -> submissions.submit(
                USER,
                UUID.randomUUID().toString(),
                new SurveyResponseSubmissionService
                        .SubmitSurveyResponseCommand(
                        active.id(),
                        List.of(new ShortTextAnswer(
                                question.id(), "answer")))))
                .isInstanceOf(DataAccessException.class)
                .hasRootCauseMessage("forced outbox failure");

        assertThat(count("survey_responses")).isZero();
        assertThat(count("integration_outbox")).isZero();
        assertThat(count("persona_generations")).isZero();
        assertThat(count("survey_idempotency_receipts")).isZero();
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM " + table, Integer.class);
    }
}
