package com.hamcheeze.vote.survey.infra.integration;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.integration.PersonaSurveyResponseSubmittedConsumer;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDeliveryService;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.application.integration.SurveyResponseSubmittedReplayException;
import com.hamcheeze.vote.survey.application.integration.SurveyResponseSubmittedReplayService;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseSubmittedReplayAuditRepository;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.time.Clock;
import java.time.Instant;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
class SurveyResponseSubmittedReplayIntegrationTest {

    private static final SurveyActorId ADMIN = new SurveyActorId("admin");
    private static final SurveyUserId USER = new SurveyUserId("user-a");

    @Autowired
    private SurveyContentVersionService contents;

    @Autowired
    private SurveyRoundService rounds;

    @Autowired
    private SurveyResponseSubmissionService submissions;

    @Autowired
    private SurveyResponseSubmittedReplayService replays;

    @Autowired
    private IntegrationOutboxRepository outbox;

    @Autowired
    private IntegrationOutboxDeliveryService deliveries;

    @Autowired
    private PersonaSurveyResponseSubmittedConsumer consumer;

    @MockitoSpyBean
    private SurveyResponseSubmittedReplayAuditRepository replayAudits;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetSurveyData() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    survey_response_submitted_replays,
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
    void replaysDeadLetterWithoutChangingOriginalFailureHistory() {
        SubmittedFixture fixture = submitSurvey();
        IntegrationOutboxMessage original = deadLetter(fixture.eventId());

        var first = replays.replay(command(fixture.eventId()));
        var repeated = replays.replay(command(fixture.eventId()));

        assertThat(first.created()).isTrue();
        assertThat(repeated.created()).isFalse();
        assertThat(repeated.audit()).isEqualTo(first.audit());
        IntegrationOutboxMessage preserved = outbox
                .findByEventId(fixture.eventId()).orElseThrow();
        assertThat(preserved.deadLettered()).isTrue();
        assertThat(preserved.attemptCount())
                .isEqualTo(original.attemptCount());
        assertThat(preserved.lastError()).isEqualTo(original.lastError());

        IntegrationOutboxMessage replay = outbox
                .findByEventId(first.audit().replayEventId()).orElseThrow();
        assertThat(replay.published()).isFalse();
        assertThat(replay.deadLettered()).isFalse();
        assertThat(replay.event().payload())
                .isEqualTo(original.event().payload());
        assertThat(replay.event().aggregateId())
                .isEqualTo(original.event().aggregateId());
        assertThat(count("integration_outbox")).isEqualTo(2);
        assertThat(count("survey_response_submitted_replays")).isEqualTo(1);
    }

    @Test
    void replayBecomesDispatchableAndConsumerRemainsIdempotent() {
        SubmittedFixture fixture = submitSurvey();
        deadLetter(fixture.eventId());
        var replay = replays.replay(command(fixture.eventId()));

        assertThat(deliveries.deliverNext()).isTrue();

        IntegrationOutboxMessage delivered = outbox.findByEventId(
                replay.audit().replayEventId()).orElseThrow();
        assertThat(delivered.published()).isTrue();
        assertThat(count("persona_generations")).isEqualTo(1);

        consumer.consume(delivered.event());

        assertThat(count("persona_generations")).isEqualTo(1);
        assertThat(count("persona_inbox")).isEqualTo(1);
    }

    @Test
    void concurrentReplayRequestsCreateOneActiveReplay() throws Exception {
        SubmittedFixture fixture = submitSurvey();
        deadLetter(fixture.eventId());
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> first = executor.submit(() -> {
                start.await();
                return replays.replay(command(fixture.eventId())).created();
            });
            Future<Boolean> second = executor.submit(() -> {
                start.await();
                return replays.replay(command(fixture.eventId())).created();
            });
            start.countDown();

            assertThat(List.of(first.get(), second.get()))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(count("integration_outbox")).isEqualTo(2);
        assertThat(count("survey_response_submitted_replays")).isEqualTo(1);
    }

    @Test
    void rejectsPendingAndDeliveredEvents() {
        SubmittedFixture pending = submitSurvey();

        assertThatThrownBy(() -> replays.replay(command(pending.eventId())))
                .isInstanceOfSatisfying(
                        SurveyResponseSubmittedReplayException.class,
                        exception -> assertThat(exception.code()).isEqualTo(
                                "SURVEY_RESPONSE_SUBMITTED_DEAD_LETTER_REQUIRED"))
                .hasMessageContaining("PENDING");

        IntegrationOutboxMessage message = outbox
                .findByEventId(pending.eventId()).orElseThrow();
        outbox.save(message.markPublished(
                message.createdAt().plusSeconds(1)));

        assertThatThrownBy(() -> replays.replay(command(pending.eventId())))
                .isInstanceOf(SurveyResponseSubmittedReplayException.class)
                .hasMessageContaining("DELIVERED");
        assertThat(count("survey_response_submitted_replays")).isZero();
    }

    @Test
    void replayAndAuditInsertRollBackTogether() {
        SubmittedFixture fixture = submitSurvey();
        deadLetter(fixture.eventId());
        doThrow(new IllegalStateException("forced audit failure"))
                .when(replayAudits).insert(any());

        assertThatThrownBy(() -> replays.replay(command(fixture.eventId())))
                .hasRootCauseMessage("forced audit failure");

        assertThat(count("integration_outbox")).isEqualTo(1);
        assertThat(count("survey_response_submitted_replays")).isZero();
    }

    @Test
    void reportsPendingAgeDeadLetterAndMissingEventCounts() {
        SubmittedFixture fixture = submitSurvey();
        IntegrationOutboxMessage pending = outbox
                .findByEventId(fixture.eventId()).orElseThrow();
        SurveyResponseSubmittedOutboxStatusQuery status =
                new SurveyResponseSubmittedOutboxStatusQuery(
                        jdbcTemplate,
                        Clock.fixed(
                                pending.createdAt().plusSeconds(41),
                                ZoneOffset.UTC));

        var pendingSnapshot = status.snapshot();

        assertThat(pendingSnapshot.pendingCount()).isEqualTo(1);
        assertThat(pendingSnapshot.oldestPendingAgeSeconds()).isEqualTo(41);
        assertThat(pendingSnapshot.deadLetterCount()).isZero();
        assertThat(pendingSnapshot.missingEventCount()).isZero();

        deadLetter(fixture.eventId());
        var deadLetterSnapshot = status.snapshot();
        assertThat(deadLetterSnapshot.pendingCount()).isZero();
        assertThat(deadLetterSnapshot.deadLetterCount()).isEqualTo(1);

        jdbcTemplate.update(
                "DELETE FROM integration_outbox WHERE event_id = ?",
                fixture.eventId());
        var missingSnapshot = status.snapshot();
        assertThat(missingSnapshot.deadLetterCount()).isZero();
        assertThat(missingSnapshot.missingEventCount()).isEqualTo(1);
    }

    private SubmittedFixture submitSurvey() {
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
                        "replay", null, List.of(question)),
                ADMIN);
        var published = contents.publish(
                draft.id(), ADMIN).contentVersion();
        var active = rounds.startPublishedContentNow(
                        published.id(), null, ADMIN)
                .targetRound();
        var outcome = submissions.submit(
                USER,
                UUID.randomUUID().toString(),
                new SurveyResponseSubmissionService
                        .SubmitSurveyResponseCommand(
                        active.id(),
                        List.of(new ShortTextAnswer(
                                question.id(), "answer"))))
                .outcome();
        UUID eventId = jdbcTemplate.queryForObject(
                """
                SELECT event_id
                FROM integration_outbox
                WHERE aggregate_id = ?
                """,
                UUID.class,
                outcome.responseId().value());
        return new SubmittedFixture(eventId);
    }

    private IntegrationOutboxMessage deadLetter(UUID eventId) {
        IntegrationOutboxMessage message = outbox
                .findByEventId(eventId).orElseThrow();
        return outbox.save(message.recordFailure(
                "PERSONA_TEMPORARY_FAILURE: fixture",
                message.createdAt().plusSeconds(1),
                null));
    }

    private static SurveyResponseSubmittedReplayService.ReplayCommand command(
            UUID eventId
    ) {
        return new SurveyResponseSubmittedReplayService.ReplayCommand(
                eventId,
                "operations-admin",
                "temporary downstream incident was resolved");
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM " + table,
                Integer.class);
    }

    private record SubmittedFixture(UUID eventId) {
    }
}
