package com.hamcheeze.vote.survey.verification;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.survey.application.content.SurveyContentVersionService;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.application.query.MySurveyResponseQueryService;
import com.hamcheeze.vote.survey.application.response.SurveyResponseSubmissionService;
import com.hamcheeze.vote.survey.application.response.SurveySubmissionOutcome;
import com.hamcheeze.vote.survey.application.round.SurveyRoundService;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
import com.hamcheeze.vote.survey.domain.response.ShortTextAnswer;
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
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "vote.survey.bootstrap.enabled=false")
@ActiveProfiles({"local", "test"})
class SurveyConcurrencyIntegrationTest {

    private static final SurveyActorId ADMIN =
            new SurveyActorId("concurrency-admin");
    private static final SurveyUserId USER =
            new SurveyUserId("concurrency-user");

    @Autowired
    private SurveyContentVersionService contentService;

    @Autowired
    private SurveyRoundService roundService;

    @Autowired
    private SurveyResponseSubmissionService submissionService;

    @Autowired
    private MySurveyResponseQueryService responseQuery;

    @Autowired
    private SurveyRoundRepository roundRepository;

    @Autowired
    private TransactionTemplate transactions;

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
    void schedulerAndManualStartHaveOneTransitionWinner()
            throws Exception {
        PublishedContent content = publish("scheduler-race", "질문 1");
        SurveyRound scheduled = roundService.schedule(
                        content.value().id(),
                        Instant.now().plusMillis(100),
                        "due",
                        ADMIN)
                .round();
        Thread.sleep(150);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> scheduler = executor.submit(() -> {
                start.await();
                return roundService.activateDueRound(
                        scheduled.id(), ADMIN).changed();
            });
            Future<Boolean> manual = executor.submit(() -> {
                start.await();
                return roundService.startScheduledRoundNow(
                        scheduled.id(), "manual", ADMIN).changed();
            });
            start.countDown();

            assertThat(List.of(scheduler.get(), manual.get()))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertSingleActiveRoundWithMonotonicNumbers();
    }

    @Test
    void concurrentImmediateStartsAreSerializedWithMonotonicNumbers()
            throws Exception {
        PublishedContent first = publish("immediate-a", "질문 A");
        PublishedContent second = publish("immediate-b", "질문 B");
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<SurveyRound> firstStart = executor.submit(() -> {
                start.await();
                return roundService.startPublishedContentNow(
                        first.value().id(), "first", ADMIN).targetRound();
            });
            Future<SurveyRound> secondStart = executor.submit(() -> {
                start.await();
                return roundService.startPublishedContentNow(
                        second.value().id(), "second", ADMIN).targetRound();
            });
            start.countDown();
            assertThat(List.of(firstStart.get(), secondStart.get()))
                    .extracting(round -> round.roundNumber().value())
                    .containsExactlyInAnyOrder(1, 2);
        }
        assertSingleActiveRoundWithMonotonicNumbers();
        assertThat(roundService.findAll())
                .extracting(SurveyRound::status)
                .containsExactlyInAnyOrder(
                        SurveyRoundStatus.ACTIVE,
                        SurveyRoundStatus.CLOSED);
    }

    @Test
    void rescheduleAndActivationRaceLeavesOneValidActiveRound()
            throws Exception {
        PublishedContent content = publish("reschedule-race", "질문");
        SurveyRound scheduled = roundService.schedule(
                        content.value().id(),
                        Instant.now().plusSeconds(3600),
                        "initial",
                        ADMIN)
                .round();
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Attempt> reschedule = executor.submit(() -> attempt(() -> {
                start.await();
                roundService.reschedule(
                        scheduled.id(),
                        Instant.now().plusSeconds(7200),
                        "changed",
                        ADMIN);
            }));
            Future<Attempt> activation = executor.submit(() -> attempt(() -> {
                start.await();
                roundService.startScheduledRoundNow(
                        scheduled.id(), "activate", ADMIN);
            }));
            start.countDown();

            assertThat(List.of(reschedule.get(), activation.get()))
                    .anyMatch(Attempt::succeeded);
        }
        assertSingleActiveRoundWithMonotonicNumbers();
        assertThat(roundService.findById(scheduled.id()).orElseThrow()
                .status()).isEqualTo(SurveyRoundStatus.ACTIVE);
    }

    @Test
    void transitionWaitsWhileSubmissionSharedLockIsHeld()
            throws Exception {
        PublishedContent first = publish("shared-lock-a", "질문 A");
        SurveyRound active = roundService.startPublishedContentNow(
                        first.value().id(), "first", ADMIN)
                .targetRound();
        PublishedContent next = publish("shared-lock-b", "질문 B");
        CountDownLatch sharedLockHeld = new CountDownLatch(1);
        CountDownLatch releaseSharedLock = new CountDownLatch(1);
        CountDownLatch transitionAttempted = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<?> lockHolder = executor.submit(() -> transactions.execute(
                    ignored -> {
                        roundRepository.findByIdForShare(active.id())
                                .orElseThrow();
                        sharedLockHeld.countDown();
                        await(releaseSharedLock);
                        return null;
                    }));
            assertThat(sharedLockHeld.await(5, TimeUnit.SECONDS)).isTrue();

            Future<SurveyRound> transition = executor.submit(() -> {
                transitionAttempted.countDown();
                return roundService.startPublishedContentNow(
                        next.value().id(), "next", ADMIN).targetRound();
            });
            assertThat(transitionAttempted.await(5, TimeUnit.SECONDS)).isTrue();
            try {
                assertThatThrownBy(() -> transition.get(
                        300, TimeUnit.MILLISECONDS))
                        .isInstanceOf(TimeoutException.class);
            } finally {
                releaseSharedLock.countDown();
            }

            lockHolder.get(5, TimeUnit.SECONDS);
            assertThat(transition.get(5, TimeUnit.SECONDS).status())
                    .isEqualTo(SurveyRoundStatus.ACTIVE);
        }
        assertSingleActiveRoundWithMonotonicNumbers();
    }

    @Test
    void submissionAfterTransitionCannotPersistForClosedRound() {
        PublishedContent first = publish("closed-submit-a", "이전 질문");
        SurveyRound oldRound = roundService.startPublishedContentNow(
                        first.value().id(), "first", ADMIN)
                .targetRound();
        PublishedContent next = publish("closed-submit-b", "현재 질문");
        roundService.startPublishedContentNow(
                next.value().id(), "next", ADMIN);

        SurveySubmissionOutcome outcome = submissionService.submit(
                        USER,
                        UUID.randomUUID().toString(),
                        command(oldRound, first, "늦은 답변"))
                .outcome();

        assertThat(outcome.code())
                .isEqualTo("SURVEY_SUBMISSION_ROUND_CHANGED");
        assertThat(responseQuery.findHistory(USER)).isEmpty();
    }

    @Test
    void successfulResponseReferencesTheLockedRoundAndContent() {
        PublishedContent content = publish("reference", "참조 질문");
        SurveyRound active = roundService.startPublishedContentNow(
                        content.value().id(), "active", ADMIN)
                .targetRound();

        SurveySubmissionOutcome outcome = submissionService.submit(
                        USER,
                        UUID.randomUUID().toString(),
                        command(active, content, "응답"))
                .outcome();

        assertThat(outcome.succeeded()).isTrue();
        var stored = responseQuery.findLatest(USER).orElseThrow();
        assertThat(stored.roundId()).isEqualTo(active.id());
        assertThat(stored.roundNumber()).isEqualTo(active.roundNumber());
        assertThat(stored.contentVersionId())
                .isEqualTo(content.value().id());
        assertThat(stored.answers().getFirst().questionId())
                .isEqualTo(content.question().id());
    }

    @Test
    void concurrentSameIdempotencyKeyReturnsOneResultAndOneReplay()
            throws Exception {
        PublishedContent content = publish("idempotency-race", "멱등 질문");
        SurveyRound active = roundService.startPublishedContentNow(
                        content.value().id(), "active", ADMIN)
                .targetRound();
        String key = UUID.randomUUID().toString();
        var command = command(active, content, "같은 응답");
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<SurveyResponseSubmissionService.SubmissionExecution> first =
                    executor.submit(() -> {
                        start.await();
                        return submissionService.submit(USER, key, command);
                    });
            Future<SurveyResponseSubmissionService.SubmissionExecution> second =
                    executor.submit(() -> {
                        start.await();
                        return submissionService.submit(USER, key, command);
                    });
            start.countDown();

            var executions = List.of(first.get(), second.get());
            assertThat(executions)
                    .extracting(SurveyResponseSubmissionService
                            .SubmissionExecution::replayed)
                    .containsExactlyInAnyOrder(false, true);
            assertThat(executions.getFirst().outcome())
                    .isEqualTo(executions.getLast().outcome());
        }
        assertThat(responseQuery.findHistory(USER)).hasSize(1);
    }

    private void assertSingleActiveRoundWithMonotonicNumbers() {
        List<SurveyRound> all = roundService.findAll();
        assertThat(all.stream()
                .filter(round -> round.status() == SurveyRoundStatus.ACTIVE))
                .hasSize(1);
        assertThat(all.stream()
                .map(round -> round.roundNumber().value())
                .sorted()
                .toList())
                .containsExactlyElementsOf(java.util.stream.IntStream
                        .rangeClosed(1, all.size()).boxed().toList());
    }

    private SurveyResponseSubmissionService.SubmitSurveyResponseCommand command(
            SurveyRound round,
            PublishedContent content,
            String answer
    ) {
        return new SurveyResponseSubmissionService
                .SubmitSurveyResponseCommand(
                round.id(),
                List.of(new ShortTextAnswer(
                        content.question().id(), answer)));
    }

    private PublishedContent publish(String name, String prompt) {
        SurveyQuestion question = new SurveyQuestion(
                new SurveyQuestionId(UUID.randomUUID()),
                new SurveyQuestionLineageKey(UUID.randomUUID()),
                SurveyQuestionType.SHORT_TEXT,
                prompt,
                null,
                1,
                true,
                ShortTextRule.defaults(),
                List.of());
        SurveyContentVersion draft = contentService.createDraft(
                new SurveyContentVersionService.CreateDraftCommand(
                        name, null, List.of(question)),
                ADMIN);
        return new PublishedContent(
                contentService.publish(draft.id(), ADMIN).contentVersion(),
                question);
    }

    private static Attempt attempt(ThrowingAction action) {
        try {
            action.run();
            return new Attempt(true);
        } catch (Exception ignored) {
            return new Attempt(false);
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("latch timed out");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted", exception);
        }
    }

    private record PublishedContent(
            SurveyContentVersion value,
            SurveyQuestion question
    ) {
    }

    private record Attempt(boolean succeeded) {
    }

    @FunctionalInterface
    private interface ThrowingAction {
        void run() throws Exception;
    }
}
