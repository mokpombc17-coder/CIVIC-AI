package com.hamcheeze.vote.task.application.prediction;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.query.MyTaskSubmissionQueryService;
import com.hamcheeze.vote.task.application.submission.TaskSubmissionService;
import com.hamcheeze.vote.task.application.task.TaskAdministrationService;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.submission.TaskAnswerSource;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=false"
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

    @Autowired
    private TaskPredictionStateService states;

    @Autowired
    private TaskPredictionApplicationPolicy policy;

    @Autowired
    private TaskAdministrationService administration;

    @Autowired
    private TaskPredictionService predictionService;

    @Autowired
    private TaskSubmissionService submissionService;

    @Autowired
    private MyTaskSubmissionQueryService submissionQueries;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void concurrentEnsureUsesOneRequestAndExternalWaitKeepsNoRowLock()
            throws Exception {
        Task task = persistOpenTask();
        TaskUserId userId = new TaskUserId("task-user-" + UUID.randomUUID());
        CurrentTaskPersona persona = insertSucceededPersona(userId.value());
        CurrentTaskPersonaQueryPort currentPersona = ignored ->
                Optional.of(persona);
        TaskPredictionService service = new TaskPredictionService(
                tasks, predictions, currentPersona, policy);
        CountDownLatch start = new CountDownLatch(1);

        TaskPrediction first;
        TaskPrediction second;
        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstFuture = executor.submit(() -> {
                start.await();
                return service.ensureTaskPrediction(userId, task.id())
                        .prediction();
            });
            var secondFuture = executor.submit(() -> {
                start.await();
                return service.ensureTaskPrediction(userId, task.id())
                        .prediction();
            });
            start.countDown();
            first = firstFuture.get(10, TimeUnit.SECONDS);
            second = secondFuture.get(10, TimeUnit.SECONDS);
        }

        assertThat(first.id()).isEqualTo(second.id());
        assertThat(predictions.findByIdentity(
                userId, task.id(), persona.generationId()))
                .get()
                .extracting(TaskPrediction::requestId)
                .isEqualTo(first.id());

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
        assertThat(completed.candidates()).hasSize(2);
        assertThat(predictions.findAttempts(first.id()))
                .singleElement()
                .extracting(TaskPredictionAttempt::outcome)
                .isEqualTo(TaskPredictionAttemptOutcome.SUCCEEDED);
    }

    @Test
    void administersSchedulesPredictsAndSubmitsThroughPersistedAdapters() {
        TaskQuestion question = shortTextQuestion();
        TaskActorId admin = new TaskActorId("task-e2e-admin");
        Task draft = administration.createDraft(
                new TaskAdministrationService.CreateDraftCommand(
                        "Task 종단 검증 과업",
                        "관리자 작성부터 AI 예상 답변 채택까지 검증합니다.",
                        List.of(question)),
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
        TaskPredictionCandidate adopted = succeeded.candidates().getFirst();
        var execution = submissionService.submit(
                userId,
                UUID.randomUUID().toString(),
                new TaskSubmissionService.SubmitTaskCommand(
                        openTask.id(),
                        succeeded.id(),
                        List.of(new AcceptTaskPredictionCandidate(
                                question.id(), adopted.id()))));

        assertThat(execution.replayed()).isFalse();
        assertThat(execution.outcome().code())
                .isEqualTo("TASK_SUBMISSION_CREATED");
        assertThat(submissionQueries.findByTask(userId, openTask.id()))
                .get()
                .satisfies(submission -> {
                    assertThat(submission.predictionId())
                            .isEqualTo(succeeded.id());
                    assertThat(submission.answers())
                            .singleElement()
                            .satisfies(answer -> {
                                assertThat(answer.source())
                                        .isEqualTo(TaskAnswerSource.AI_ACCEPTED);
                                assertThat(answer.adoptedCandidate()
                                        .candidateId())
                                        .isEqualTo(adopted.id());
                                assertThat(answer.finalAnswerValue())
                                        .isEqualTo(adopted.answerValue());
                            });
                });
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

    private TaskQuestion shortTextQuestion() {
        return new TaskQuestion(
                new TaskQuestionId(UUID.randomUUID()),
                1,
                TaskQuestionType.SHORT_TEXT,
                "예상 답변을 작성할 질문",
                null,
                ShortTextConstraint.defaults(),
                List.of());
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
                    generation_id, survey_response_id, persona_id, status,
                    attempt_count, created_at, processing_started_at,
                    completed_at, updated_at)
                VALUES (?, ?, ?, 'SUCCEEDED', 1, ?, ?, ?, ?)
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
        List<TaskPredictionCandidate> candidates = List.of(
                candidate(command, question, 1),
                candidate(command, question, 2));
        return new PredictionCreationResult(
                command.requestId(),
                command.task().id(),
                candidates,
                200,
                SanitizedTaskPredictionPayload.fromSanitized(
                        "{\"model\":\"fake-integration\"}"));
    }

    private TaskPredictionCandidate candidate(
            PredictionCreationCommand command,
            TaskQuestion question,
            int order
    ) {
        return new TaskPredictionCandidate(
                new TaskPredictionCandidateId(UUID.randomUUID()),
                command.requestId(),
                question.id(),
                order,
                new ShortTextValue("예상 답변 " + order),
                "예상 근거 " + order);
    }
}
