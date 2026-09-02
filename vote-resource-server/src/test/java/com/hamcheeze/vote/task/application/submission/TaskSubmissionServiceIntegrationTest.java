package com.hamcheeze.vote.task.application.submission;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyErrorCode;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyException;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictedReason;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.submission.WriteTaskReason;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=true",
        "vote.task.prediction.provider=fake",
        "vote.task.prediction.dispatcher-delay=1h",
        "vote.task.prediction.lease-reaper-delay=1h"
})
@ActiveProfiles({"local", "test"})
class TaskSubmissionServiceIntegrationTest {

    private static final AtomicLong SURVEY_SEQUENCE =
            new AtomicLong();
    private static final TaskActorId ADMIN =
            new TaskActorId("task-submission-test-admin");

    @Autowired
    private TaskSubmissionService service;

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private TaskResultManifestRepository resultManifests;

    @MockitoSpyBean
    private TaskPredictionRepository predictions;

    @MockitoSpyBean
    private TaskSubmissionRepository submissions;

    @Autowired
    private TaskAdministrationService administration;

    @Autowired
    private UserTransactionLock userTransactions;

    @MockitoSpyBean
    private TaskSubmissionMetrics metrics;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetData() {
        jdbcTemplate.execute("TRUNCATE TABLE tasks CASCADE");
        jdbcTemplate.execute(
                "TRUNCATE TABLE survey_content_versions CASCADE");
    }

    @Test
    void successReplayWinsBeforeTaskClosureAndPersonaChange() {
        Fixture fixture = fixture("replay-user");
        String key = UUID.randomUUID().toString();
        TaskSubmissionService.SubmitTaskCommand command =
                command(fixture, "첫 제출");

        TaskSubmissionService.SubmissionExecution first = service.submit(
                fixture.userId(), key, command);
        administration.closeEarly(
                fixture.task().id(), "replay verification", ADMIN);
        insertSucceededPersona(
                fixture.userId().value(), Instant.now(), "new");

        TaskSubmissionService.SubmissionExecution replay = service.submit(
                fixture.userId(), key, command);

        assertThat(first.replayed()).isFalse();
        assertThat(first.outcome().succeeded()).isTrue();
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.outcome()).isEqualTo(first.outcome());
        assertThat(submissionCount(fixture)).isEqualTo(1);
    }

    @Test
    void directMetricRunsOnceAfterCommitAndNotOnIdempotentReplay() {
        Fixture fixture = fixtureWithoutPrediction("metric-replay-user");
        String key = UUID.randomUUID().toString();
        TaskSubmissionService.SubmitTaskCommand command =
                commandWithoutPrediction(fixture, "metric replay");

        TaskSubmissionService.SubmissionExecution first = service.submit(
                fixture.userId(), key, command);
        TaskSubmissionService.SubmissionExecution replay = service.submit(
                fixture.userId(), key, command);

        assertThat(first.outcome().httpStatus()).isEqualTo(201);
        assertThat(replay.replayed()).isTrue();
        verify(metrics, times(1)).directWithoutPrediction();
        assertThat(submissionCount(fixture)).isEqualTo(1);
    }

    @Test
    void directMetricUsesTransactionPredictionWithoutPostCommitLookup() {
        Fixture fixture = fixture(
                "metric-pending-user", TaskPredictionStatus.PENDING);
        clearInvocations(predictions);

        TaskSubmissionService.SubmissionExecution result = service.submit(
                fixture.userId(),
                UUID.randomUUID().toString(),
                command(fixture, "pending prediction direct"));

        assertThat(result.outcome().httpStatus()).isEqualTo(201);
        verify(predictions, times(1)).findByIdentity(
                fixture.userId(), fixture.task().id(),
                fixture.prediction().personaGenerationId());
        verify(metrics, times(1))
                .directWhilePredictionNonTerminal();
    }

    @Test
    void directMetricsDistinguishNonTerminalAndTerminalPredictions() {
        for (TaskPredictionStatus status : List.of(
                TaskPredictionStatus.PROCESSING,
                TaskPredictionStatus.RETRY_WAIT)) {
            Fixture fixture = fixture(
                    "metric-" + status.name().toLowerCase() + "-user",
                    status);
            assertThat(service.submit(
                    fixture.userId(),
                    UUID.randomUUID().toString(),
                    command(fixture, status.name() + " direct"))
                    .outcome().httpStatus()).isEqualTo(201);
        }
        verify(metrics, times(2))
                .directWhilePredictionNonTerminal();

        Fixture failed = fixture(
                "metric-failed-user", TaskPredictionStatus.FAILED);
        assertThat(service.submit(
                failed.userId(),
                UUID.randomUUID().toString(),
                command(failed, "failed direct"))
                .outcome().httpStatus()).isEqualTo(201);
        verify(metrics, times(2))
                .directWhilePredictionNonTerminal();
        verify(metrics, never()).directWithoutPrediction();
    }

    @Test
    void succeededPredictionRecordsAiAcceptedMetric() {
        Fixture fixture = fixture(
                "metric-ai-user", TaskPredictionStatus.SUCCEEDED);
        TaskPredictedReason accepted = fixture.prediction()
                .predictedReasons().getFirst();
        TaskSubmissionService.SubmitTaskCommand command =
                new TaskSubmissionService.SubmitTaskCommand(
                        fixture.task().id(),
                        accepted.optionId(),
                        TaskReasonSource.AI_ACCEPTED,
                        accepted.id(),
                        null);

        TaskSubmissionService.SubmissionExecution result = service.submit(
                fixture.userId(), UUID.randomUUID().toString(), command);

        assertThat(result.outcome().httpStatus()).isEqualTo(201);
        verify(metrics, times(1)).aiAccepted();
    }

    @Test
    void metricCallbackFailuresDoNotChangeCommittedSubmissionResults() {
        doThrow(new IllegalStateException("direct metric unavailable"))
                .when(metrics).directWithoutPrediction();
        doThrow(new IllegalStateException("nonterminal metric unavailable"))
                .when(metrics).directWhilePredictionNonTerminal();
        doThrow(new IllegalStateException("ai metric unavailable"))
                .when(metrics).aiAccepted();

        Fixture withoutPrediction = fixtureWithoutPrediction(
                "metric-failure-direct-user");
        Fixture pending = fixture(
                "metric-failure-pending-user",
                TaskPredictionStatus.PENDING);
        Fixture succeeded = fixture(
                "metric-failure-ai-user",
                TaskPredictionStatus.SUCCEEDED);
        TaskPredictedReason accepted = succeeded.prediction()
                .predictedReasons().getFirst();
        List<TaskSubmissionService.SubmissionExecution> results = List.of(
                service.submit(
                        withoutPrediction.userId(),
                        UUID.randomUUID().toString(),
                        commandWithoutPrediction(
                                withoutPrediction, "direct failure")),
                service.submit(
                        pending.userId(),
                        UUID.randomUUID().toString(),
                        command(pending, "pending failure")),
                service.submit(
                        succeeded.userId(),
                        UUID.randomUUID().toString(),
                        new TaskSubmissionService.SubmitTaskCommand(
                                succeeded.task().id(),
                                accepted.optionId(),
                                TaskReasonSource.AI_ACCEPTED,
                                accepted.id(),
                                null)));

        assertThat(results)
                .extracting(result -> result.outcome().httpStatus())
                .containsOnly(201);
        assertThat(receiptStatuses(withoutPrediction.userId()))
                .containsExactly("SUCCEEDED");
        assertThat(receiptStatuses(pending.userId()))
                .containsExactly("SUCCEEDED");
        assertThat(receiptStatuses(succeeded.userId()))
                .containsExactly("SUCCEEDED");
    }

    @Test
    void submissionInsertFailureRollsBackWithoutMetricCallback() {
        Fixture fixture = fixtureWithoutPrediction(
                "submission-rollback-user");
        doThrow(new IllegalStateException(
                "forced task submission insert failure"))
                .when(submissions).insert(any());

        assertThatThrownBy(() -> service.submit(
                fixture.userId(),
                UUID.randomUUID().toString(),
                commandWithoutPrediction(fixture, "insert rollback")))
                .isInstanceOf(DataAccessException.class)
                .hasRootCauseMessage(
                        "forced task submission insert failure");

        assertThat(submissionCount(fixture)).isZero();
        assertThat(receiptStatuses(fixture.userId())).isEmpty();
        verify(metrics, never()).directWithoutPrediction();
    }

    @Test
    void sameKeyDifferentBodyIsIdempotencyConflict() {
        Fixture fixture = fixture("conflict-user");
        String key = UUID.randomUUID().toString();
        service.submit(fixture.userId(), key, command(fixture, "원본"));

        assertThatThrownBy(() -> service.submit(
                fixture.userId(), key, command(fixture, "변경")))
                .isInstanceOfSatisfying(
                        TaskIdempotencyException.class,
                        exception -> assertThat(exception.code())
                                .isEqualTo(TaskIdempotencyErrorCode
                                        .IDEMPOTENCY_CONFLICT));
        assertThat(submissionCount(fixture)).isEqualTo(1);
    }

    @Test
    void concurrentSameKeyExecutesOnceAndReplays() throws Exception {
        Fixture fixture = fixture("same-key-concurrent-user");
        String key = UUID.randomUUID().toString();
        TaskSubmissionService.SubmitTaskCommand command =
                command(fixture, "동일 요청");
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<TaskSubmissionService.SubmissionExecution> first =
                    executor.submit(() -> {
                        start.await();
                        return service.submit(
                                fixture.userId(), key, command);
                    });
            Future<TaskSubmissionService.SubmissionExecution> second =
                    executor.submit(() -> {
                        start.await();
                        return service.submit(
                                fixture.userId(), key, command);
                    });
            start.countDown();
            List<TaskSubmissionService.SubmissionExecution> results =
                    List.of(
                            first.get(15, TimeUnit.SECONDS),
                            second.get(15, TimeUnit.SECONDS));

            assertThat(results)
                    .extracting(TaskSubmissionService.SubmissionExecution
                            ::replayed)
                    .containsExactlyInAnyOrder(false, true);
            assertThat(results)
                    .extracting(result -> result.outcome().submissionId())
                    .containsOnly(results.getFirst().outcome().submissionId());
        }
        assertThat(submissionCount(fixture)).isEqualTo(1);
    }

    @Test
    void differentKeysLeaveOneFinalSubmissionAndTwoStableReceipts()
            throws Exception {
        Fixture fixture = fixture("different-key-user");
        TaskSubmissionService.SubmitTaskCommand command =
                command(fixture, "동시 제출");
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<TaskSubmissionService.SubmissionExecution> first =
                    executor.submit(() -> {
                        start.await();
                        return service.submit(
                                fixture.userId(),
                                UUID.randomUUID().toString(),
                                command);
                    });
            Future<TaskSubmissionService.SubmissionExecution> second =
                    executor.submit(() -> {
                        start.await();
                        return service.submit(
                                fixture.userId(),
                                UUID.randomUUID().toString(),
                                command);
                    });
            start.countDown();
            List<TaskSubmissionService.SubmissionExecution> results =
                    List.of(
                            first.get(15, TimeUnit.SECONDS),
                            second.get(15, TimeUnit.SECONDS));

            assertThat(results)
                    .extracting(result -> result.outcome().httpStatus())
                    .containsExactlyInAnyOrder(201, 409);
            assertThat(results)
                    .extracting(TaskSubmissionService.SubmissionExecution
                            ::replayed)
                    .containsOnly(false);
        }
        assertThat(submissionCount(fixture)).isEqualTo(1);
        assertThat(receiptStatuses(fixture.userId()))
                .containsExactlyInAnyOrder("SUCCEEDED", "REJECTED");
    }

    @Test
    void invalidAnswerRejectionIsStoredAndReplayed() {
        Fixture fixture = fixture("invalid-answer-user");
        String key = UUID.randomUUID().toString();
        TaskSubmissionService.SubmitTaskCommand invalid =
                new TaskSubmissionService.SubmitTaskCommand(
                        fixture.task().id(),
                        new TaskOptionId(UUID.randomUUID()),
                        TaskReasonSource.USER_WRITTEN,
                        null,
                        "유효한 이유");

        TaskSubmissionService.SubmissionExecution first = service.submit(
                fixture.userId(), key, invalid);
        TaskSubmissionService.SubmissionExecution replay = service.submit(
                fixture.userId(), key, invalid);

        assertThat(first.outcome().httpStatus()).isEqualTo(422);
        assertThat(first.outcome().code())
                .isEqualTo("TASK_SUBMISSION_OPTION_MISMATCH");
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.outcome()).isEqualTo(first.outcome());
        assertThat(submissionCount(fixture)).isZero();
    }

    @Test
    void closeCommittedFirstMakesSubmissionReject() throws Exception {
        Fixture fixture = fixture("close-first-user");
        CountDownLatch closedAndLocked = new CountDownLatch(1);
        CountDownLatch releaseClose = new CountDownLatch(1);
        TransactionTemplate transactions =
                new TransactionTemplate(transactionManager);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<?> close = executor.submit(() -> transactions.execute(
                    status -> {
                        Task locked = tasks.findByIdForUpdate(
                                        fixture.task().id())
                                .orElseThrow();
                        locked.closeEarly(
                                new TaskLifecycleHistoryId(UUID.randomUUID()),
                                ADMIN,
                                "close first",
                                Instant.now());
                        tasks.save(locked);
                        closedAndLocked.countDown();
                        await(releaseClose);
                        return null;
                    }));
            assertThat(closedAndLocked.await(5, TimeUnit.SECONDS)).isTrue();
            Future<TaskSubmissionService.SubmissionExecution> submit =
                    executor.submit(() -> service.submit(
                            fixture.userId(),
                            UUID.randomUUID().toString(),
                            command(fixture, "늦은 제출")));
            assertThat(submit.isDone()).isFalse();

            releaseClose.countDown();
            close.get(10, TimeUnit.SECONDS);
            TaskSubmissionService.SubmissionExecution result =
                    submit.get(10, TimeUnit.SECONDS);

            assertThat(result.outcome().httpStatus()).isEqualTo(409);
            assertThat(result.outcome().code())
                    .isEqualTo("TASK_SUBMISSION_TASK_CLOSED");
        }
        assertThat(submissionCount(fixture)).isZero();
    }

    @Test
    void userLockWaitDoesNotPreventTaskClose() throws Exception {
        Fixture fixture = fixture("submit-first-user");
        CountDownLatch userLockHeld = new CountDownLatch(1);
        CountDownLatch releaseUserLock = new CountDownLatch(1);
        TransactionTemplate transactions =
                new TransactionTemplate(transactionManager);

        try (var executor = Executors.newFixedThreadPool(3)) {
            Future<?> guard = executor.submit(() -> transactions.execute(
                    status -> {
                        userTransactions.lock(fixture.userId().value());
                        userLockHeld.countDown();
                        await(releaseUserLock);
                        return null;
                    }));
            assertThat(userLockHeld.await(5, TimeUnit.SECONDS)).isTrue();
            Future<TaskSubmissionService.SubmissionExecution> submit =
                    executor.submit(() -> service.submit(
                            fixture.userId(),
                            UUID.randomUUID().toString(),
                            command(fixture, "먼저 시작한 제출")));
            awaitAdvisoryWait();

            Future<?> close = executor.submit(() -> administration.closeEarly(
                    fixture.task().id(), "close after submit", ADMIN));
            close.get(10, TimeUnit.SECONDS);

            releaseUserLock.countDown();
            TaskSubmissionService.SubmissionExecution submitted =
                    submit.get(10, TimeUnit.SECONDS);
            guard.get(10, TimeUnit.SECONDS);

            assertThat(submitted.outcome().succeeded()).isFalse();
            assertThat(submitted.outcome().code())
                    .isEqualTo("TASK_SUBMISSION_TASK_CLOSED");
        }
        assertThat(submissionCount(fixture)).isZero();
        assertThat(tasks.findById(fixture.task().id()))
                .get()
                .extracting(Task::status)
                .isEqualTo(TaskStatus.CLOSED);
        assertThat(resultManifests.findByTaskId(fixture.task().id()))
                .get()
                .satisfies(manifest -> assertThat(manifest.responseCount())
                        .isZero());
    }

    @Test
    void personaTransitionCommittedFirstInvalidatesOldPrediction()
            throws Exception {
        Fixture fixture = fixture(
                "persona-transition-user", TaskPredictionStatus.SUCCEEDED);
        TaskPredictedReason oldReason = fixture.prediction()
                .predictedReasons().getFirst();
        CountDownLatch transitionPrepared = new CountDownLatch(1);
        CountDownLatch releaseTransition = new CountDownLatch(1);
        TransactionTemplate transactions =
                new TransactionTemplate(transactionManager);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<?> transition = executor.submit(() ->
                    transactions.execute(status -> {
                        userTransactions.lock(fixture.userId().value());
                        insertSucceededPersona(
                                fixture.userId().value(),
                                Instant.now(),
                                "transition");
                        transitionPrepared.countDown();
                        await(releaseTransition);
                        return null;
                    }));
            assertThat(transitionPrepared.await(5, TimeUnit.SECONDS))
                    .isTrue();
            Future<TaskSubmissionService.SubmissionExecution> submit =
                    executor.submit(() -> service.submit(
                            fixture.userId(),
                            UUID.randomUUID().toString(),
                            new TaskSubmissionService.SubmitTaskCommand(
                                    fixture.task().id(),
                                    oldReason.optionId(),
                                    TaskReasonSource.AI_ACCEPTED,
                                    oldReason.id(),
                                    null)));
            assertThat(submit.isDone()).isFalse();

            releaseTransition.countDown();
            transition.get(10, TimeUnit.SECONDS);
            TaskSubmissionService.SubmissionExecution result =
                    submit.get(10, TimeUnit.SECONDS);

            assertThat(result.outcome().httpStatus()).isEqualTo(409);
            assertThat(result.outcome().code())
                    .isEqualTo("TASK_SUBMISSION_PREDICTION_UNAVAILABLE");
        }
        assertThat(submissionCount(fixture)).isZero();
    }

    private Fixture fixture(String userValue) {
        return fixture(userValue, TaskPredictionStatus.FAILED);
    }

    private Fixture fixtureWithoutPrediction(String userValue) {
        Fixture fixture = fixture(userValue);
        jdbcTemplate.update(
                "DELETE FROM task_predictions WHERE prediction_id = ?",
                fixture.prediction().id().value());
        return fixture;
    }

    private Fixture fixture(
            String userValue,
            TaskPredictionStatus predictionStatus
    ) {
        Instant now = Instant.now();
        TaskUserId userId = new TaskUserId(userValue);
        TaskQuestion question = new TaskQuestion(
                new TaskQuestionId(UUID.randomUUID()),
                1,
                TaskQuestionType.SINGLE_CHOICE,
                "하나를 선택할 질문",
                null,
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(
                                new TaskOptionId(UUID.randomUUID()), 1, "A"),
                        TaskOption.standard(
                                new TaskOptionId(UUID.randomUUID()), 2, "B")));
        Task task = Task.draft(
                new TaskId(UUID.randomUUID()),
                "제출 통합 테스트 과업",
                null,
                List.of(question),
                now.minus(10, ChronoUnit.SECONDS));
        task.openImmediately(
                new TaskLifecycleHistoryId(UUID.randomUUID()),
                now.plus(1, ChronoUnit.HOURS),
                ADMIN,
                null,
                now.minus(9, ChronoUnit.SECONDS));
        task = tasks.save(task);
        PersonaFixture persona = insertSucceededPersona(
                userId.value(),
                now.minus(20, ChronoUnit.SECONDS),
                "initial");
        TaskPrediction prediction = TaskPrediction.pending(
                new TaskPredictionId(UUID.randomUUID()),
                userId,
                task.id(),
                persona.generationId(),
                persona.personaId(),
                "candidate-policy-v1",
                now.minus(8, ChronoUnit.SECONDS));
        TaskPredictionRetryPolicy retryPolicy =
                new TaskPredictionRetryPolicy(
                        Duration.ofSeconds(60),
                        2,
                        Duration.ofSeconds(30));
        switch (predictionStatus) {
            case PENDING -> {
            }
            case PROCESSING -> prediction.startProcessing(
                    retryPolicy, now.minus(7, ChronoUnit.SECONDS));
            case RETRY_WAIT -> {
                prediction.startProcessing(
                        retryPolicy, now.minus(7, ChronoUnit.SECONDS));
                prediction.failAttempt(
                        new TaskPredictionError(
                                "AI_TIMEOUT", "retry direct answers"),
                        retryPolicy,
                        now.minus(6, ChronoUnit.SECONDS));
            }
            case FAILED -> {
                prediction.startProcessing(
                        retryPolicy, now.minus(7, ChronoUnit.SECONDS));
                prediction.failPermanently(
                        new TaskPredictionError(
                                "AI_UNAVAILABLE", "use direct answers"),
                        now.minus(6, ChronoUnit.SECONDS));
            }
            case SUCCEEDED -> {
                prediction.startProcessing(
                        retryPolicy, now.minus(7, ChronoUnit.SECONDS));
                prediction.succeed(
                        task,
                        predictedReasons(prediction, question),
                        now.minus(6, ChronoUnit.SECONDS));
            }
        }
        prediction = predictions.insert(prediction);
        return new Fixture(userId, task, question, prediction);
    }

    private List<TaskPredictedReason> predictedReasons(
            TaskPrediction prediction,
            TaskQuestion question
    ) {
        return question.options().stream()
                .flatMap(option -> java.util.stream.IntStream
                        .rangeClosed(1, 2)
                        .mapToObj(order -> new TaskPredictedReason(
                                new TaskPredictedReasonId(UUID.randomUUID()),
                                prediction.id(),
                                option.id(),
                                order,
                                "예상 이유 " + order)))
                .toList();
    }

    private TaskSubmissionService.SubmitTaskCommand command(
            Fixture fixture,
            String answer
    ) {
        int optionIndex = "변경".equals(answer) ? 1 : 0;
        return new TaskSubmissionService.SubmitTaskCommand(
                fixture.task().id(),
                fixture.question().options().get(optionIndex).id(),
                TaskReasonSource.USER_WRITTEN,
                null,
                answer + " 이유");
    }

    private TaskSubmissionService.SubmitTaskCommand commandWithoutPrediction(
            Fixture fixture,
            String answer
    ) {
        return new TaskSubmissionService.SubmitTaskCommand(
                fixture.task().id(),
                fixture.question().options().getFirst().id(),
                TaskReasonSource.USER_WRITTEN,
                null,
                answer + " 이유");
    }

    private PersonaFixture insertSucceededPersona(
            String userId,
            Instant submittedAt,
            String suffix
    ) {
        long sequence = SURVEY_SEQUENCE.incrementAndGet();
        UUID contentId = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        UUID generationId = UUID.randomUUID();
        String personaId = "persona-" + suffix + "-" + generationId;
        Timestamp timestamp = Timestamp.from(submittedAt);
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, ?, 'admin', ?, 'admin', ?,
                    'admin', ?)
                """, contentId, sequence,
                "Task submission survey " + sequence,
                timestamp, timestamp, timestamp);
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    scheduled_at, canceled_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'CANCELED', ?, ?, 'admin', ?, 0)
                """, roundId, sequence, contentId,
                timestamp, timestamp, timestamp);
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id,
                    content_version_id, submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """, responseId, userId, roundId, contentId, timestamp);
        jdbcTemplate.update("""
                INSERT INTO persona_generations (
                    generation_id, source_type, source_id, persona_id, status,
                    attempt_count, created_at, processing_started_at,
                    completed_at, updated_at)
                VALUES (?, 'SURVEY_RESPONSE', ?, ?, 'SUCCEEDED', 1, ?, ?, ?, ?)
                """, generationId, responseId, personaId,
                timestamp, timestamp, timestamp, timestamp);
        return new PersonaFixture(
                new TaskPersonaGenerationId(generationId),
                new TaskPersonaId(personaId));
    }

    private int submissionCount(Fixture fixture) {
        return jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM task_submissions
                WHERE user_id = ? AND task_id = ?
                """, Integer.class,
                fixture.userId().value(), fixture.task().id().value());
    }

    private List<String> receiptStatuses(TaskUserId userId) {
        return jdbcTemplate.queryForList("""
                SELECT status
                FROM task_submission_receipts
                WHERE user_id = ?
                """, String.class, userId.value());
    }

    private void awaitAdvisoryWait() throws Exception {
        Instant deadline = Instant.now().plusSeconds(5);
        while (Instant.now().isBefore(deadline)) {
            Integer waiting = jdbcTemplate.queryForObject("""
                    SELECT count(*)
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                      AND wait_event_type = 'Lock'
                      AND wait_event = 'advisory'
                    """, Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            Thread.sleep(25);
        }
        throw new IllegalStateException(
                "submission did not wait for the user advisory lock");
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("timed out waiting for latch");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    @Test
    void aiAcceptanceWithoutCurrentPredictionIsRejected() {
        Fixture fixture = fixtureWithoutPrediction(
                "ai-without-prediction-user");
        TaskSubmissionService.SubmissionExecution result = service.submit(
                fixture.userId(),
                UUID.randomUUID().toString(),
                new TaskSubmissionService.SubmitTaskCommand(
                        fixture.task().id(),
                        fixture.question().options().getFirst().id(),
                        TaskReasonSource.AI_ACCEPTED,
                        new TaskPredictedReasonId(UUID.randomUUID()),
                        null));

        assertThat(result.outcome().httpStatus()).isEqualTo(409);
        assertThat(result.outcome().code())
                .isEqualTo("TASK_SUBMISSION_PREDICTION_UNAVAILABLE");
        assertThat(submissionCount(fixture)).isZero();
    }

    @Test
    void userWrittenSubmissionAutoLinksCurrentSucceededPrediction() {
        Fixture fixture = fixture(
                "direct-with-succeeded-prediction-user",
                TaskPredictionStatus.SUCCEEDED);

        TaskSubmissionService.SubmissionExecution result = service.submit(
                fixture.userId(),
                UUID.randomUUID().toString(),
                command(fixture, "성공 예측 후 직접 작성"));

        assertThat(result.outcome().succeeded()).isTrue();
        UUID storedPredictionId = jdbcTemplate.queryForObject("""
                SELECT prediction_id
                FROM task_submissions
                WHERE submission_id = ?
                """, UUID.class, result.outcome().submissionId().value());
        assertThat(storedPredictionId)
                .isEqualTo(fixture.prediction().id().value());
    }

    @Test
    void userWrittenSubmissionWithoutPredictionPersistsNullableProvenance() {
        Fixture fixture = fixtureWithoutPrediction(
                "direct-without-prediction-user");
        TaskSubmissionService.SubmitTaskCommand command =
                new TaskSubmissionService.SubmitTaskCommand(
                        fixture.task().id(),
                        fixture.question().options().getFirst().id(),
                        TaskReasonSource.USER_WRITTEN,
                        null,
                        "예측 없이 직접 작성한 이유");

        TaskSubmissionService.SubmissionExecution result = service.submit(
                fixture.userId(), UUID.randomUUID().toString(), command);

        assertThat(result.outcome().succeeded()).isTrue();
        UUID storedPredictionId = jdbcTemplate.queryForObject("""
                SELECT prediction_id
                FROM task_submissions
                WHERE submission_id = ?
                """, UUID.class, result.outcome().submissionId().value());
        assertThat(storedPredictionId).isNull();
        String reasonSource = jdbcTemplate.queryForObject("""
                SELECT reason_source
                FROM task_submissions
                WHERE submission_id = ?
                """, String.class, result.outcome().submissionId().value());
        assertThat(reasonSource).isEqualTo("USER_WRITTEN");
        String finalReason = jdbcTemplate.queryForObject("""
                SELECT final_reason
                FROM task_submissions
                WHERE submission_id = ?
                """, String.class, result.outcome().submissionId().value());
        assertThat(finalReason).isEqualTo("예측 없이 직접 작성한 이유");
    }

    private record Fixture(
            TaskUserId userId,
            Task task,
            TaskQuestion question,
            TaskPrediction prediction
    ) {
    }

    private record PersonaFixture(
            TaskPersonaGenerationId generationId,
            TaskPersonaId personaId
    ) {
    }
}
