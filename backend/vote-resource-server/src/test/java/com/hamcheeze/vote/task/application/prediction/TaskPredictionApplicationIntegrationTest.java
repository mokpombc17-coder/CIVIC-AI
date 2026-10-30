package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputRepository;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionInputSnapshotFactory;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRuntimeStatus;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictedReason;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

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
class TaskPredictionApplicationIntegrationTest {

    private static final AtomicLong SURVEY_SEQUENCE =
            new AtomicLong(1_000_000_000L
                    + Math.floorMod(System.nanoTime(), 500_000_000L));

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private TaskPredictionRepository predictions;

    @MockitoSpyBean
    private TaskPredictionInputRepository predictionInputs;

    @Autowired
    private TaskPredictionInputSnapshotFactory predictionInputSnapshots;

    @Autowired
    private TaskPredictionStateService states;

    @Autowired
    private TaskPredictionApplicationPolicy policy;

    @Autowired
    private TaskAdministrationService administration;

    @Autowired
    private TaskPredictionService predictionService;

    @Autowired
    private TaskPredictionMaintenanceService maintenance;

    @Autowired
    private TaskSubmissionService submissionService;

    @Autowired
    private MyTaskSubmissionQueryService submissionQueries;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private MeterRegistry meterRegistry;

    @AfterEach
    void resetSpies() {
        reset(predictionInputs);
    }

    @Test
    void concurrentEnsureUsesOneRequestAndExternalWaitKeepsNoRowLock()
            throws Exception {
        Task task = persistOpenTask();
        TaskUserId userId = new TaskUserId("task-user-" + UUID.randomUUID());
        CurrentTaskPersona persona = insertSucceededPersona(userId.value());
        CountDownLatch start = new CountDownLatch(1);

        EnsureTaskPredictionResult firstResult;
        EnsureTaskPredictionResult secondResult;
        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstFuture = executor.submit(() -> {
                start.await();
                return predictionService.ensureTaskPrediction(
                        userId, task.id());
            });
            var secondFuture = executor.submit(() -> {
                start.await();
                return predictionService.ensureTaskPrediction(
                        userId, task.id());
            });
            start.countDown();
            firstResult = firstFuture.get(10, TimeUnit.SECONDS);
            secondResult = secondFuture.get(10, TimeUnit.SECONDS);
        }

        TaskPrediction first = firstResult.prediction();
        TaskPrediction second = secondResult.prediction();

        assertThat(first.id()).isEqualTo(second.id());
        assertThat(List.of(firstResult.created(), secondResult.created()))
                .containsExactlyInAnyOrder(true, false);
        assertThat(predictions.findByIdentity(
                userId, task.id(), persona.generationId()))
                .get()
                .extracting(TaskPrediction::requestId)
                .isEqualTo(first.id());
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM task_predictions
                WHERE user_id = ? AND task_id = ?
                  AND persona_generation_id = ?
                """, Long.class, userId.value(), task.id().value(),
                persona.generationId().value())).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM task_prediction_inputs input
                JOIN task_predictions prediction
                  ON prediction.prediction_id = input.prediction_id
                WHERE prediction.user_id = ? AND prediction.task_id = ?
                  AND prediction.persona_generation_id = ?
                """, Long.class, userId.value(), task.id().value(),
                persona.generationId().value())).isEqualTo(1L);
        CountDownLatch portEntered = new CountDownLatch(1);
        CountDownLatch releasePort = new CountDownLatch(1);
        PredictionCreationPort fakePort = command -> {
            portEntered.countDown();
            try {
                if (!releasePort.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("test port release timed out");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(exception);
            }
            return success(command);
        };
        TaskPredictionDispatcher dispatcher = new TaskPredictionDispatcher(
                states, fakePort, policy);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var dispatch = executor.submit(dispatcher::dispatchAvailable);
            assertThat(portEntered.await(5, TimeUnit.SECONDS)).isTrue();

            var competingLock = executor.submit(() ->
                    predictions.findByIdForUpdate(first.id())
                            .orElseThrow().status());
            assertThat(competingLock.get(2, TimeUnit.SECONDS))
                    .isEqualTo(TaskPredictionStatus.PROCESSING);

            releasePort.countDown();
            assertThat(dispatch.get(10, TimeUnit.SECONDS)).isEqualTo(1);
        }

        TaskPrediction completed = predictions.findById(first.id())
                .orElseThrow();
        assertThat(completed.status())
                .isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(completed.predictedReasons()).hasSize(4);
        assertThat(predictions.findAttempts(first.id()))
                .singleElement()
                .extracting(TaskPredictionAttempt::outcome)
                .isEqualTo(TaskPredictionAttemptOutcome.SUCCEEDED);
    }

    @Test
    void persistsRuntimeProcessingStatusAndRequeuesItOnUserDemand() {
        Task task = persistOpenTask();
        TaskUserId userId = new TaskUserId(
                "task-remote-processing-" + UUID.randomUUID());
        insertSucceededPersona(userId.value());
        TaskPrediction prediction = predictionService.ensureTaskPrediction(
                        userId, task.id())
                .prediction();
        Instant processingAt = prediction.createdAt();
        prediction.startProcessing(
                new TaskPredictionAttemptId(UUID.randomUUID()),
                policy.retryPolicy(), policy.processingLeaseDuration(),
                processingAt);
        TaskPredictionRuntimeStatus runtimeStatus =
                new TaskPredictionRuntimeStatus(
                        "PREDICTION_NOT_READY",
                        "AI 예상 이유를 준비 중입니다.", true, 10);
        prediction.markRemoteProcessing(
                runtimeStatus, Duration.ZERO,
                processingAt);
        predictions.save(prediction);

        assertThat(predictions.findById(prediction.id())).get().satisfies(
                stored -> {
                    assertThat(stored.status()).isEqualTo(
                            TaskPredictionStatus.REMOTE_PROCESSING);
                    assertThat(stored.runtimeStatus()).isEqualTo(runtimeStatus);
                });

        assertThat(predictionService.requestRemoteRecheckIfDue(
                userId, task.id())).isTrue();
        TaskPrediction requeued = predictions.findById(prediction.id())
                .orElseThrow();
        assertThat(requeued.status()).isEqualTo(TaskPredictionStatus.PENDING);
        assertThat(requeued.runtimeStatus()).isEqualTo(runtimeStatus);

        requeued.failDeadline(
                new TaskPredictionError(
                        "TEST_CLEANUP", "terminalize integration fixture"),
                Instant.now().plusSeconds(1));
        predictions.save(requeued);
    }

    @Test
    void concurrentLoserCreatesPredictionWhenFirstInputInsertRollsBack()
            throws Exception {
        Task task = persistOpenTask();
        TaskUserId userId = new TaskUserId(
                "task-input-rollback-race-" + UUID.randomUUID());
        CurrentTaskPersona persona = insertSucceededPersona(userId.value());
        AtomicBoolean failFirstInput = new AtomicBoolean(true);
        doAnswer(invocation -> {
            if (failFirstInput.compareAndSet(true, false)) {
                throw new IllegalStateException(
                        "forced first input insert failure");
            }
            return invocation.callRealMethod();
        }).when(predictionInputs).insert(any());
        CountDownLatch start = new CountDownLatch(1);

        List<EnsureTaskPredictionResult> successes =
                new java.util.concurrent.CopyOnWriteArrayList<>();
        List<Throwable> failures =
                new java.util.concurrent.CopyOnWriteArrayList<>();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> ensureConcurrently(
                    start, userId, task, successes, failures));
            var second = executor.submit(() -> ensureConcurrently(
                    start, userId, task, successes, failures));
            start.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        }

        assertThat(successes).singleElement().satisfies(result ->
                assertThat(result.created()).isTrue());
        assertThat(failures).singleElement().satisfies(failure ->
                assertThat(failure).hasMessageContaining(
                        "forced first input insert failure"));
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM task_predictions
                WHERE user_id = ? AND task_id = ?
                  AND persona_generation_id = ?
                """, Long.class, userId.value(), task.id().value(),
                persona.generationId().value())).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM task_prediction_inputs input
                JOIN task_predictions prediction
                  ON prediction.prediction_id = input.prediction_id
                WHERE prediction.user_id = ? AND prediction.task_id = ?
                  AND prediction.persona_generation_id = ?
                """, Long.class, userId.value(), task.id().value(),
                persona.generationId().value())).isEqualTo(1L);
        UUID predictionId = successes.getFirst().prediction().id().value();
        jdbcTemplate.update(
                "DELETE FROM task_prediction_inputs WHERE prediction_id = ?",
                predictionId);
        jdbcTemplate.update(
                "DELETE FROM task_predictions WHERE prediction_id = ?",
                predictionId);
    }

    private void ensureConcurrently(
            CountDownLatch start,
            TaskUserId userId,
            Task task,
            List<EnsureTaskPredictionResult> successes,
            List<Throwable> failures
    ) {
        try {
            start.await();
            successes.add(predictionService.ensureTaskPrediction(
                    userId, task.id()));
        } catch (Throwable failure) {
            failures.add(failure);
        }
    }

    @Test
    void administersSchedulesPredictsAndSubmitsThroughPersistedAdapters() {
        TaskQuestion question = shortTextQuestion();
        TaskActorId admin = new TaskActorId("task-e2e-admin");
        Task draft = administration.createDraft(
                new TaskAdministrationService.CreateDraftCommand(
                        "Task 종단 검증 과업",
                        "관리자 작성부터 AI 예상 답변 채택까지 검증합니다.",
                        question),
                admin);
        Instant scheduledOpenAt = Instant.now().plus(1, ChronoUnit.HOURS);
        administration.schedule(
                draft.id(),
                new TaskSchedule(
                        scheduledOpenAt,
                        scheduledOpenAt.plus(2, ChronoUnit.HOURS)),
                "종단 검증 예약",
                admin);
        Task openTask = administration.openScheduledNow(
                draft.id(),
                "종단 검증 조기 공개",
                admin)
                .task();

        TaskUserId userId = new TaskUserId(
                "task-e2e-user-" + UUID.randomUUID());
        insertSucceededPersona(userId.value());
        TaskPrediction prediction = predictionService.ensureTaskPrediction(
                        userId, openTask.id())
                .prediction();
        TaskPredictionDispatcher dispatcher = new TaskPredictionDispatcher(
                states, this::success, policy);

        assertThat(dispatcher.dispatchAvailable()).isEqualTo(1);

        TaskPrediction succeeded = predictions.findById(prediction.id())
                .orElseThrow();
        TaskPredictedReason adopted = succeeded.predictedReasons().getFirst();
        var execution = submissionService.submit(
                userId,
                UUID.randomUUID().toString(),
                new TaskSubmissionService.SubmitTaskCommand(
                        openTask.id(),
                        adopted.optionId(),
                        TaskReasonSource.AI_ACCEPTED,
                        adopted.id(),
                        null));

        assertThat(execution.replayed()).isFalse();
        assertThat(execution.outcome().code())
                .isEqualTo("TASK_SUBMISSION_CREATED");
        assertThat(submissionQueries.findByTask(userId, openTask.id()))
                .get()
                .satisfies(submission -> {
                    assertThat(submission.predictionId())
                            .isEqualTo(succeeded.id());
                    assertThat(submission.reasonSource())
                            .isEqualTo(TaskReasonSource.AI_ACCEPTED);
                    assertThat(submission.acceptedPredictedReasonId())
                            .isEqualTo(adopted.id());
                    assertThat(submission.selectedOptionId())
                            .isEqualTo(adopted.optionId());
                    assertThat(submission.finalReason())
                            .isEqualTo(adopted.reason());
                });
    }

    @Test
    void earlyClosedTaskPredictionIsSelectedAndTerminalizedImmediately() {
        Task task = persistOpenTask();
        TaskUserId userId = new TaskUserId(
                "task-early-close-" + UUID.randomUUID());
        insertSucceededPersona(userId.value());
        TaskPrediction prediction = predictionService.ensureTaskPrediction(
                        userId, task.id())
                .prediction();

        administration.closeEarly(
                task.id(), "prediction cleanup integration", new TaskActorId(
                        "prediction-cleanup-admin"));

        assertThat(maintenance.expireNextDeadline()).isTrue();
        assertThat(predictions.findById(prediction.id()).orElseThrow())
                .satisfies(failed -> {
                    assertThat(failed.status())
                            .isEqualTo(TaskPredictionStatus.FAILED);
                    assertThat(failed.lastError().code())
                            .isEqualTo("TASK_PREDICTION_TASK_CLOSED");
                });
        assertThat(maintenance.expireNextDeadline()).isFalse();
    }

    @Test
    void deadlineExtensionHoldingTaskLockPreventsCleanupOfOldDeadline()
            throws Exception {
        Instant now = Instant.now();
        Task task = persistExpiredOpenTask(now);
        TaskPrediction prediction = insertPendingPrediction(task, now);
        Instant previousDeadline = task.schedule().scheduledCloseAt();
        Instant extendedDeadline = now.plus(1, ChronoUnit.HOURS);
        CountDownLatch deadlineChangedAndLocked = new CountDownLatch(1);
        CountDownLatch releaseDeadlineChange = new CountDownLatch(1);
        TransactionTemplate transactions = new TransactionTemplate(
                transactionManager);
        var deadlineCounter = meterRegistry.counter(
                "vote.task.prediction.deadline.expiration");
        double metricBefore = deadlineCounter.count();

        try (var executor = Executors.newFixedThreadPool(2)) {
            var admin = executor.submit(() -> transactions.execute(status -> {
                Task locked = tasks.findByIdForUpdate(task.id())
                        .orElseThrow();
                locked.changeDeadline(
                        new TaskLifecycleHistoryId(UUID.randomUUID()),
                        extendedDeadline,
                        new TaskActorId("deadline-race-admin"),
                        "extend before the previous deadline",
                        previousDeadline.minusMillis(1));
                tasks.save(locked);
                deadlineChangedAndLocked.countDown();
                await(releaseDeadlineChange);
                return null;
            }));
            assertThat(deadlineChangedAndLocked.await(
                    10, TimeUnit.SECONDS)).isTrue();

            assertThat(maintenance.expireNextDeadline()).isFalse();
            assertThat(predictions.findById(prediction.id()).orElseThrow()
                    .status()).isEqualTo(TaskPredictionStatus.PENDING);
            assertThat(deadlineCounter.count()).isEqualTo(metricBefore);

            releaseDeadlineChange.countDown();
            admin.get(10, TimeUnit.SECONDS);
        }

        assertThat(tasks.findById(task.id()).orElseThrow()
                .schedule().scheduledCloseAt()).isEqualTo(extendedDeadline);
        assertThat(maintenance.expireNextDeadline()).isFalse();
        assertThat(predictions.findById(prediction.id()).orElseThrow()
                .status()).isEqualTo(TaskPredictionStatus.PENDING);

        MutableClock afterExtendedDeadline = new MutableClock(
                extendedDeadline.plusMillis(1));
        Boolean expired = transactions.execute(status ->
                maintenance(afterExtendedDeadline).expireNextDeadline());
        assertThat(expired).isTrue();
        assertThat(predictions.findById(prediction.id()).orElseThrow()
                .lastError().code())
                .isEqualTo("TASK_PREDICTION_DEADLINE_EXPIRED");
    }

    @Test
    void cleanupHoldingTaskAndPredictionLocksRejectsLaterExtension()
            throws Exception {
        Instant now = Instant.now();
        Task task = persistExpiredOpenTask(now);
        TaskPrediction prediction = insertPendingPrediction(task, now);
        CountDownLatch cleanupAppliedAndLocked = new CountDownLatch(1);
        CountDownLatch adminStarted = new CountDownLatch(1);
        CountDownLatch releaseCleanup = new CountDownLatch(1);
        TransactionTemplate transactions = new TransactionTemplate(
                transactionManager);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var cleanup = executor.submit(() -> transactions.execute(status -> {
                boolean applied = maintenance.expireNextDeadline();
                cleanupAppliedAndLocked.countDown();
                await(adminStarted);
                await(releaseCleanup);
                return applied;
            }));
            assertThat(cleanupAppliedAndLocked.await(
                    10, TimeUnit.SECONDS)).isTrue();
            var admin = executor.submit(() -> {
                adminStarted.countDown();
                try {
                    administration.changeDeadline(
                            task.id(),
                            now.plus(1, ChronoUnit.HOURS),
                            "too late extension",
                            new TaskActorId("late-deadline-admin"));
                    return null;
                } catch (TaskDomainException exception) {
                    return exception.violation().code();
                }
            });

            releaseCleanup.countDown();
            assertThat(cleanup.get(10, TimeUnit.SECONDS)).isTrue();
            assertThat(admin.get(10, TimeUnit.SECONDS)).isEqualTo(
                    "TASK_DEADLINE_CHANGE_AFTER_CURRENT_DEADLINE_NOT_ALLOWED");
        }

        assertThat(predictions.findById(prediction.id()).orElseThrow()
                .status()).isEqualTo(TaskPredictionStatus.FAILED);
        assertThat(tasks.findById(task.id()).orElseThrow()
                .schedule().scheduledCloseAt())
                .isEqualTo(task.schedule().scheduledCloseAt());
    }

    @Test
    void claimMetricFollowsOuterTransactionCommit() {
        Task task = persistOpenTask();
        TaskUserId userId = new TaskUserId(
                "task-claim-metric-" + UUID.randomUUID());
        insertSucceededPersona(userId.value());
        predictionService.ensureTaskPrediction(userId, task.id());
        var counter = meterRegistry.counter(
                "vote.task.prediction.claim.success");
        double before = counter.count();
        TransactionTemplate transaction = new TransactionTemplate(
                transactionManager);

        transaction.executeWithoutResult(status -> {
            assertThat(states.claimNext("rollback-worker")).isPresent();
            status.setRollbackOnly();
        });
        assertThat(counter.count()).isEqualTo(before);

        TaskPredictionDispatchClaim committedClaim = states.claimNext(
                "commit-worker").orElseThrow();
        assertThat(counter.count()).isEqualTo(before + 1D);
        states.completeFailure(committedClaim, new PredictionCreationException(
                TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                false,
                null,
                "TEST_CLEANUP",
                "terminalize committed metric fixture",
                null,
                null));
    }

    @Test
    void completionHoldingPredictionRowLockWinsExpiredLeaseRace()
            throws Exception {
        Task task = persistOpenTask();
        TaskUserId userId = new TaskUserId(
                "task-completion-first-" + UUID.randomUUID());
        CurrentTaskPersona persona = insertSucceededPersona(userId.value());
        TaskPrediction prediction = ensurePrediction(task, userId);
        MutableClock clock = new MutableClock(Instant.now());
        TaskPredictionStateService stateService = stateService(clock);
        TaskPredictionMaintenanceService maintenance = maintenance(clock);
        TaskPredictionDispatchClaim claim = stateService.claimNext(
                "completion-first").orElseThrow();
        clock.set(predictions.findById(prediction.id()).orElseThrow()
                .leaseExpiresAt().plusMillis(1));

        CountDownLatch completionLocked = new CountDownLatch(1);
        CountDownLatch reaperFinished = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var completion = executor.submit(() -> new TransactionTemplate(
                    transactionManager).execute(status -> {
                predictions.findByIdForUpdate(prediction.id()).orElseThrow();
                completionLocked.countDown();
                try {
                    assertThat(reaperFinished.await(
                            10, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
                return stateService.completeSuccess(
                        claim, success(claim.command()));
            }));
            var reaper = executor.submit(() -> {
                assertThat(completionLocked.await(
                        10, TimeUnit.SECONDS)).isTrue();
                boolean recovered = maintenance.recoverNextExpiredLease();
                reaperFinished.countDown();
                return recovered;
            });

            assertThat(reaper.get(10, TimeUnit.SECONDS)).isFalse();
            assertThat(completion.get(10, TimeUnit.SECONDS)).isTrue();
        }

        assertThat(predictions.findById(prediction.id()).orElseThrow()
                .status()).isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(predictions.findAttempts(prediction.id()))
                .singleElement()
                .extracting(TaskPredictionAttempt::outcome)
                .isEqualTo(TaskPredictionAttemptOutcome.SUCCEEDED);
    }

    @Test
    void reaperHoldingPredictionRowLockFencesLateCompletion()
            throws Exception {
        Task task = persistOpenTask();
        TaskUserId userId = new TaskUserId(
                "task-reaper-first-" + UUID.randomUUID());
        CurrentTaskPersona persona = insertSucceededPersona(userId.value());
        TaskPrediction prediction = ensurePrediction(task, userId);
        MutableClock clock = new MutableClock(Instant.now());
        TaskPredictionStateService stateService = stateService(clock);
        TaskPredictionMaintenanceService maintenance = maintenance(clock);
        TaskPredictionDispatchClaim claim = stateService.claimNext(
                "reaper-first").orElseThrow();
        clock.set(predictions.findById(prediction.id()).orElseThrow()
                .leaseExpiresAt().plusMillis(1));

        CountDownLatch reaperLocked = new CountDownLatch(1);
        CountDownLatch completionStarted = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var reaper = executor.submit(() -> new TransactionTemplate(
                    transactionManager).execute(status -> {
                predictions.findByIdForUpdate(prediction.id()).orElseThrow();
                reaperLocked.countDown();
                try {
                    assertThat(completionStarted.await(
                            10, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
                return maintenance.recoverNextExpiredLease();
            }));
            var completion = executor.submit(() -> {
                assertThat(reaperLocked.await(
                        10, TimeUnit.SECONDS)).isTrue();
                completionStarted.countDown();
                return stateService.completeSuccess(
                        claim, success(claim.command()));
            });

            assertThat(reaper.get(10, TimeUnit.SECONDS)).isTrue();
            assertThat(completion.get(10, TimeUnit.SECONDS)).isFalse();
        }

        assertThat(predictions.findById(prediction.id()).orElseThrow()
                .status()).isEqualTo(TaskPredictionStatus.RETRY_WAIT);
        assertThat(predictions.findAttempts(prediction.id()))
                .singleElement()
                .satisfies(attempt -> {
                    assertThat(attempt.outcome())
                            .isEqualTo(TaskPredictionAttemptOutcome.LEASE_EXPIRED);
                    assertThat(attempt.lateCompletionObservedAt()).isNotNull();
                });
    }

    private TaskPrediction ensurePrediction(
            Task task,
            TaskUserId userId
    ) {
        return predictionService
                .ensureTaskPrediction(userId, task.id())
                .prediction();
    }

    private TaskPredictionStateService stateService(Clock clock) {
        return new TaskPredictionStateService(
                predictions, predictionInputs, tasks, policy, clock);
    }

    private TaskPredictionMaintenanceService maintenance(Clock clock) {
        return new TaskPredictionMaintenanceService(
                predictions, tasks, policy, clock);
    }

    private Task persistOpenTask() {
        Instant now = Instant.now();
        TaskQuestion question = shortTextQuestion();
        Task task = Task.draft(
                new TaskId(UUID.randomUUID()),
                "예측 애플리케이션 통합 과업",
                null,
                List.of(question),
                now.minus(2, ChronoUnit.SECONDS));
        task.openImmediately(
                new TaskLifecycleHistoryId(UUID.randomUUID()),
                now.plus(1, ChronoUnit.HOURS),
                new TaskActorId("integration-admin"),
                null,
                now.minus(1, ChronoUnit.SECONDS));
        return tasks.save(task);
    }

    private Task persistExpiredOpenTask(Instant now) {
        Task task = Task.draft(
                new TaskId(UUID.randomUUID()),
                "마감 경합 통합 과업",
                null,
                List.of(shortTextQuestion()),
                now.minus(2, ChronoUnit.HOURS));
        task.openImmediately(
                new TaskLifecycleHistoryId(UUID.randomUUID()),
                now.minus(30, ChronoUnit.SECONDS),
                new TaskActorId("deadline-race-admin"),
                null,
                now.minus(1, ChronoUnit.MINUTES));
        return tasks.save(task);
    }

    private TaskPrediction insertPendingPrediction(Task task, Instant now) {
        return predictions.insert(TaskPrediction.pending(
                new com.hamcheeze.vote.task.domain.common.TaskPredictionId(
                        UUID.randomUUID()),
                new TaskUserId("deadline-race-" + UUID.randomUUID()),
                task.id(),
                new TaskPersonaGenerationId(UUID.randomUUID()),
                new TaskPersonaId("deadline-race-persona-" + UUID.randomUUID()),
                "candidate-policy-v1",
                now.minus(45, ChronoUnit.SECONDS)));
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

    private static final class MutableClock extends Clock {

        private final AtomicReference<Instant> now;

        private MutableClock(Instant now) {
            this.now = new AtomicReference<>(now);
        }

        void set(Instant instant) {
            now.set(instant);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    }

    private TaskQuestion shortTextQuestion() {
        return new TaskQuestion(
                new TaskQuestionId(UUID.randomUUID()),
                1,
                TaskQuestionType.SINGLE_CHOICE,
                "예상 이유를 만들 선택 질문",
                null,
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(
                                new TaskOptionId(UUID.randomUUID()), 1, "A"),
                        TaskOption.standard(
                                new TaskOptionId(UUID.randomUUID()), 2, "B")));
    }

    private CurrentTaskPersona insertSucceededPersona(String userId) {
        long sequence = SURVEY_SEQUENCE.incrementAndGet();
        UUID contentId = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        UUID generationId = UUID.randomUUID();
        String personaId = "persona-" + generationId;
        Timestamp createdAt = Timestamp.from(
                Instant.now().minus(10, ChronoUnit.SECONDS));
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, ?, 'admin', ?, 'admin', ?,
                    'admin', ?)
                """, contentId, sequence,
                "Task prediction integration " + sequence,
                createdAt, createdAt, createdAt);
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    scheduled_at, canceled_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'CANCELED', ?, ?, 'admin', ?, 0)
                """, roundId, sequence, contentId,
                createdAt, createdAt, createdAt);
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id,
                    content_version_id, submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """, responseId, userId, roundId, contentId, createdAt);
        jdbcTemplate.update("""
                INSERT INTO persona_generations (
                    generation_id, source_type, source_id, persona_id, status,
                    attempt_count, created_at, processing_started_at,
                    completed_at, updated_at)
                VALUES (?, 'SURVEY_RESPONSE', ?, ?, 'SUCCEEDED', 1, ?, ?, ?, ?)
                """, generationId, responseId, personaId,
                createdAt, createdAt, createdAt, createdAt);
        return new CurrentTaskPersona(
                new TaskPersonaGenerationId(generationId),
                new TaskPersonaId(personaId));
    }

    private PredictionCreationResult success(
            PredictionCreationCommand command
    ) {
        TaskQuestion question = command.task().questions().getFirst();
        List<TaskPredictedReason> candidates = List.of(
                candidate(command, question, 0, 1),
                candidate(command, question, 0, 2),
                candidate(command, question, 1, 1),
                candidate(command, question, 1, 2));
        return new PredictionCreationResult(
                command.requestId(),
                command.task().id(),
                candidates,
                200,
                SanitizedTaskPredictionPayload.fromSanitized(
                        "{\"model\":\"fake-integration\"}"));
    }

    private TaskPredictedReason candidate(
            PredictionCreationCommand command,
            TaskQuestion question,
            int optionIndex,
            int order
    ) {
        return new TaskPredictedReason(
                new TaskPredictedReasonId(UUID.randomUUID()),
                command.requestId(),
                question.options().get(optionIndex).id(),
                order,
                "예상 근거 " + order);
    }
}
