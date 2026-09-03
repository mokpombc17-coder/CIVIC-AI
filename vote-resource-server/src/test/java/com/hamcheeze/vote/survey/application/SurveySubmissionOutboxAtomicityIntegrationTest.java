package com.hamcheeze.vote.survey.application;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.survey.SurveyConsentTestFixture;
import com.hamcheeze.vote.survey.application.consent.SurveyConsentService;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDispatcher;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
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
import org.springframework.context.ApplicationContext;
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
@SpringBootTest(properties =
        "vote.integration.outbox.dispatcher-enabled=false")
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

    @Autowired
    private SurveyConsentService consents;

    @MockitoSpyBean
    private IntegrationOutboxRepository outbox;

    @MockitoSpyBean
    private SurveyResponseRepository responses;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ApplicationContext applicationContext;

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
        var command = activeSubmission();
        doThrow(new IllegalStateException("forced outbox failure"))
                .when(outbox).insert(any());

        assertThatThrownBy(() -> submissions.submit(
                USER, UUID.randomUUID().toString(), command))
                .isInstanceOf(DataAccessException.class)
                .hasRootCauseMessage("forced outbox failure");

        assertAtomicSubmissionTablesAreEmpty();
    }

    @Test
    void responseFailureDoesNotPersistReceiptOrOutbox() {
        var command = activeSubmission();
        doThrow(new IllegalStateException("forced response failure"))
                .when(responses).insert(any());

        assertThatThrownBy(() -> submissions.submit(
                USER, UUID.randomUUID().toString(), command))
                .isInstanceOf(DataAccessException.class)
                .hasRootCauseMessage("forced response failure");

        assertAtomicSubmissionTablesAreEmpty();
    }

    @Test
    void pausedDispatcherStillStoresPendingOutboxEvent() {
        submissions.submit(
                USER,
                UUID.randomUUID().toString(),
                activeSubmission());

        assertThat(applicationContext.getBeansOfType(
                IntegrationOutboxDispatcher.class)).isEmpty();
        assertThat(count("survey_responses")).isOne();
        assertThat(jdbcTemplate.queryForObject(
                """
                        SELECT count(*)
                        FROM integration_outbox
                        WHERE published_at IS NULL
                          AND dead_lettered_at IS NULL
                        """,
                Integer.class)).isOne();
        assertThat(count("persona_generations")).isZero();
    }

    private SurveyResponseSubmissionService.SubmitSurveyResponseCommand
    activeSubmission() {
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
        return new SurveyResponseSubmissionService.SubmitSurveyResponseCommand(
                active.id(),
                SurveyConsentTestFixture.accept(consents, active.id(), USER),
                List.of(new ShortTextAnswer(question.id(), "answer")));
    }

    private void assertAtomicSubmissionTablesAreEmpty() {
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
