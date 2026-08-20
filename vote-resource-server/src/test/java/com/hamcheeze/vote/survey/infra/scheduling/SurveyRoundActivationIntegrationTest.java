package com.hamcheeze.vote.survey.infra.scheduling;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.application.round.SurveyRoundActivationJob;
import com.hamcheeze.vote.survey.application.round.SurveyRoundService;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import com.hamcheeze.vote.survey.domain.round.SurveyRoundStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
class SurveyRoundActivationIntegrationTest {

    private static final SurveyActorId ADMIN = new SurveyActorId("admin");

    @Autowired
    private SurveyContentVersionService contents;

    @Autowired
    private SurveyRoundService roundService;

    @Autowired
    private SurveyRoundActivationJob activationJob;

    @MockitoSpyBean
    private SurveyRoundRepository roundRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetSurveyData() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
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
    void firstPollCatchesUpPersistedDueRoundWithoutWaiting() {
        SurveyRound scheduled = schedule("restart-catch-up");

        assertThat(activationJob.activateDueRounds()).isEmpty();
        assertThat(roundService.findById(scheduled.id()).orElseThrow()
                .status()).isEqualTo(SurveyRoundStatus.SCHEDULED);

        makeDue(scheduled);
        var plans = activationJob.activateDueRounds();

        assertThat(plans).hasSize(1);
        assertThat(plans.getFirst().changed()).isTrue();
        assertThat(roundService.findById(scheduled.id()).orElseThrow()
                .status()).isEqualTo(SurveyRoundStatus.ACTIVE);
        assertThat(activationJob.activateDueRounds()).isEmpty();
        assertThat(countActiveRounds()).isEqualTo(1);
    }

    @Test
    void overlappingPollsActivateSameRoundOnlyOnce() throws Exception {
        SurveyRound scheduled = schedule("overlapping-polls");
        makeDue(scheduled);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Long> first = executor.submit(() -> {
                start.await();
                return changedCount();
            });
            Future<Long> second = executor.submit(() -> {
                start.await();
                return changedCount();
            });
            start.countDown();

            assertThat(first.get() + second.get()).isEqualTo(1);
        }
        assertThat(countActiveRounds()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                """
                SELECT count(*)
                FROM survey_round_transitions
                WHERE round_id = ? AND type = 'ACTIVATED'
                """,
                Integer.class,
                scheduled.id().value())).isEqualTo(1);
    }

    @Test
    void failedActivationRollsBackAndNextPollRetriesSuccessfully() {
        SurveyRound active = roundService.startPublishedContentNow(
                        publish("current").id(), null, ADMIN)
                .targetRound();
        SurveyRound scheduled = schedule("rollback-retry");
        makeDue(scheduled);
        doThrow(new IllegalStateException("forced transition failure"))
                .doCallRealMethod()
                .when(roundRepository).appendTransitions(any());

        assertThatThrownBy(activationJob::activateDueRounds)
                .hasRootCauseMessage("forced transition failure");

        assertThat(roundService.findById(active.id()).orElseThrow().status())
                .isEqualTo(SurveyRoundStatus.ACTIVE);
        assertThat(roundService.findById(scheduled.id()).orElseThrow().status())
                .isEqualTo(SurveyRoundStatus.SCHEDULED);
        assertThat(countActiveRounds()).isEqualTo(1);

        doCallRealMethod().when(roundRepository).appendTransitions(any());
        assertThat(activationJob.activateDueRounds())
                .singleElement()
                .satisfies(plan -> assertThat(plan.changed()).isTrue());
        assertThat(roundService.findById(active.id()).orElseThrow().status())
                .isEqualTo(SurveyRoundStatus.CLOSED);
        assertThat(roundService.findById(scheduled.id()).orElseThrow().status())
                .isEqualTo(SurveyRoundStatus.ACTIVE);
        assertThat(countActiveRounds()).isEqualTo(1);
    }

    private long changedCount() {
        return activationJob.activateDueRounds().stream()
                .filter(plan -> plan.changed())
                .count();
    }

    private SurveyRound schedule(String name) {
        return roundService.schedule(
                        publish(name).id(),
                        Instant.now().plusSeconds(3600),
                        name,
                        ADMIN)
                .round();
    }

    private com.hamcheeze.vote.survey.domain.content.SurveyContentVersion
    publish(String name) {
        SurveyQuestion question = new SurveyQuestion(
                new SurveyQuestionId(UUID.randomUUID()),
                new SurveyQuestionLineageKey(UUID.randomUUID()),
                SurveyQuestionType.SHORT_TEXT,
                "질문",
                null,
                1,
                true,
                ShortTextRule.defaults(),
                List.of());
        var draft = contents.createDraft(
                new SurveyContentVersionService.CreateDraftCommand(
                        name, null, List.of(question)),
                ADMIN);
        return contents.publish(draft.id(), ADMIN).contentVersion();
    }

    private void makeDue(SurveyRound round) {
        Instant scheduledAt = Instant.now().minusSeconds(30);
        Instant createdAt = scheduledAt.minusSeconds(30);
        jdbcTemplate.update("""
                UPDATE survey_rounds
                SET scheduled_at = ?, created_at = ?
                WHERE round_id = ?
                """,
                Timestamp.from(scheduledAt),
                Timestamp.from(createdAt),
                round.id().value());
    }

    private int countActiveRounds() {
        return jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM survey_rounds
                WHERE status = 'ACTIVE'
                """, Integer.class);
    }
}
