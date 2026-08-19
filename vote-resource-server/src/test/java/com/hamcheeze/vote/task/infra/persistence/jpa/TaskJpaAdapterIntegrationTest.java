package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.idempotency.StoredTaskSubmissionOutcome;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.idempotency.TaskRequestHash;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceipt;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceiptStatus;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionReceiptRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionPersistenceException;
import com.hamcheeze.vote.task.domain.answer.SingleChoiceValue;
import com.hamcheeze.vote.task.domain.answer.TaskOptionSelection;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionAttemptId;
import com.hamcheeze.vote.task.domain.common.TaskPredictedReasonId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskReceiptId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttempt;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictedReason;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionError;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionStatus;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.submission.TaskSubmissionAnswer;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.OptimisticLockException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "vote.survey.bootstrap.enabled=false")
@ActiveProfiles({"local", "test"})
class TaskJpaAdapterIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-18T00:00:00Z");
    private static final AtomicLong SURVEY_VERSION =
            new AtomicLong(70_000);

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private TaskPredictionRepository predictions;

    @Autowired
    private TaskSubmissionRepository submissions;

    @Autowired
    private TaskSubmissionReceiptRepository receipts;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private EntityManager entityManager;

    @Test
    void roundTripsTaskContentScheduleAndLifecycleHistory() {
        TaskFixture fixture = draftTask();
        Task storedDraft = tasks.save(fixture.task());

        var history = storedDraft.schedule(
                new TaskLifecycleHistoryId(UUID.randomUUID()),
                new TaskSchedule(NOW.plusSeconds(60), NOW.plusSeconds(600)),
                new TaskActorId("admin"),
                "첫 공개 예약",
                NOW);
        Task storedScheduled = tasks.save(storedDraft);
        tasks.appendLifecycleHistory(List.of(history));

        Task restored = tasks.findById(storedScheduled.id()).orElseThrow();
        assertThat(restored.status()).isEqualTo(TaskStatus.SCHEDULED);
        assertThat(restored.title()).isEqualTo("사용자 선호 과업");
        assertThat(restored.questions()).hasSize(1);
        assertThat(restored.questions().getFirst().options())
                .extracting(TaskOption::content)
                .containsExactly("찬성", "반대");
        assertThat(restored.schedule()).isEqualTo(
                new TaskSchedule(NOW.plusSeconds(60), NOW.plusSeconds(600)));
        assertThat(tasks.findLifecycleHistory(restored.id()))
                .singleElement()
                .satisfies(saved -> {
                    assertThat(saved).isEqualTo(history);
                    assertThat(saved.reason()).isEqualTo("첫 공개 예약");
                });
    }

    @Test
    void roundTripsPredictionCandidatesAttemptsAndRecoversIdentityConflict() {
        TaskFixture fixture = openTask();
        tasks.save(fixture.task());
        String rawUserId = "prediction-" + UUID.randomUUID();
        TaskUserId userId = new TaskUserId(rawUserId);
        PersonaFixture persona = insertSucceededPersona(rawUserId);
        TaskPrediction prediction = succeededPrediction(
                fixture, userId, persona, UUID.randomUUID());

        TaskPrediction inserted = predictions.insert(prediction);
        TaskPredictionAttempt attempt = TaskPredictionAttempt.started(
                new TaskPredictionAttemptId(UUID.randomUUID()),
                prediction.id(),
                1,
                SanitizedTaskPredictionPayload.fromSanitized(
                        "{\"request\":\"sanitized\"}"),
                NOW.minusSeconds(4)).complete(
                TaskPredictionAttemptOutcome.SUCCEEDED,
                200,
                SanitizedTaskPredictionPayload.fromSanitized(
                        "{\"response\":\"sanitized\"}"),
                null,
                null,
                NOW.minusSeconds(3));
        predictions.saveAttempt(attempt);

        assertThat(inserted.status()).isEqualTo(TaskPredictionStatus.SUCCEEDED);
        assertThat(inserted.personaVersionId()).isEqualTo(persona.versionId());
        assertThat(inserted.predictedReasons()).hasSize(4);
        assertThat(inserted.predictedReasons().getFirst().optionId())
                .isEqualTo(fixture.firstOptionId());
        assertThat(predictions.findAttempts(prediction.id()))
                .singleElement()
                .satisfies(saved -> {
                    assertThat(saved.outcome())
                            .isEqualTo(TaskPredictionAttemptOutcome.SUCCEEDED);
                    assertThat(saved.requestId()).isEqualTo(prediction.id());
                    assertThat(saved.responsePayload().value())
                            .contains("sanitized");
                });

        TaskPrediction duplicate = succeededPrediction(
                fixture, userId, persona, UUID.randomUUID());
        assertThatThrownBy(() -> predictions.insert(duplicate))
                .isInstanceOfSatisfying(
                        TaskPredictionPersistenceException.class,
                        exception -> assertThat(exception.code()).isEqualTo(
                                TaskPredictionPersistenceException.ErrorCode
                                        .IDENTITY_ALREADY_EXISTS));
        assertThat(predictions.findByIdentity(
                        userId,
                        fixture.task().id(),
                        persona.generationId()))
                .get()
                .extracting(TaskPrediction::id)
                .isEqualTo(prediction.id());
    }

    @Test
    void roundTripsSubmissionTypedAnswersAndReceiptReplayData() {
        TaskFixture fixture = openTask();
        tasks.save(fixture.task());
        String rawUserId = "submission-" + UUID.randomUUID();
        TaskUserId userId = new TaskUserId(rawUserId);
        PersonaFixture persona = insertSucceededPersona(rawUserId);
        TaskPrediction prediction = predictions.insert(succeededPrediction(
                fixture, userId, persona, UUID.randomUUID()));
        TaskPredictedReason adopted = prediction.predictedReasons().getFirst();
        TaskSubmission submission = TaskSubmission.restore(
                new TaskSubmissionId(UUID.randomUUID()),
                userId,
                fixture.task(),
                prediction,
                persona.generationId(),
                persona.versionId(),
                List.of(TaskSubmissionAnswer.aiAccepted(
                        fixture.choiceQuestionId(),
                        adopted.id(),
                        new SingleChoiceValue(new TaskOptionSelection(
                                adopted.optionId(), null)))),
                NOW);

        TaskSubmission stored = submissions.insert(submission);
        assertThat(stored.personaVersionId()).isEqualTo(persona.versionId());
        assertThat(stored.answers()).hasSize(1);
        assertThat(stored.answers().getFirst()
                .adoptedPredictionCandidateId()).isEqualTo(adopted.id());

        TaskSubmissionReceipt receipt = TaskSubmissionReceipt.processing(
                new TaskReceiptId(UUID.randomUUID()),
                userId,
                new TaskIdempotencyKey(UUID.randomUUID()),
                new TaskRequestHash(new byte[32]),
                1,
                NOW,
                NOW.plusSeconds(3600));
        receipts.insertProcessing(receipt);
        receipt.complete(
                new StoredTaskSubmissionOutcome(
                        1,
                        201,
                        "{\"code\":\"TASK_SUBMITTED\"}",
                        submission.id()),
                NOW.plusSeconds(1));
        receipts.updateCompleted(receipt);

        assertThat(receipts.findByRequest(
                        userId, receipt.idempotencyKey()))
                .get()
                .satisfies(saved -> {
                    assertThat(saved.status())
                            .isEqualTo(TaskSubmissionReceiptStatus.SUCCEEDED);
                    assertThat(saved.requestHash()).isEqualTo(
                            new TaskRequestHash(new byte[32]));
                    assertThat(saved.storedOutcome().submissionId())
                            .isEqualTo(submission.id());
                    assertThat(saved.storedOutcome().payload())
                            .contains("TASK_SUBMITTED");
                });
    }

    @Test
    void roundTripsDirectSingleChoiceAnswerWithoutOtherInput() {
        TaskFixture fixture = openTask();
        tasks.save(fixture.task());
        String rawUserId = "direct-choice-" + UUID.randomUUID();
        TaskUserId userId = new TaskUserId(rawUserId);
        PersonaFixture persona = insertSucceededPersona(rawUserId);
        TaskPrediction prediction = predictions.insert(TaskPrediction.restore(
                new TaskPredictionId(UUID.randomUUID()),
                userId,
                fixture.task(),
                persona.generationId(),
                persona.versionId(),
                persona.personaId(),
                "policy-v1",
                TaskPredictionStatus.FAILED,
                1,
                List.of(),
                null,
                new TaskPredictionError("AI_TIMEOUT", "응답 시간 초과"),
                NOW.minusSeconds(5),
                NOW.minusSeconds(4),
                NOW.minusSeconds(3)));
        List<TaskSubmissionAnswer> answers = List.of(
                TaskSubmissionAnswer.userAnswered(
                        fixture.choiceQuestionId(),
                        new SingleChoiceValue(new TaskOptionSelection(
                                fixture.firstOptionId(), null))));
        TaskSubmission submission = TaskSubmission.restore(
                new TaskSubmissionId(UUID.randomUUID()),
                userId,
                fixture.task(),
                prediction,
                persona.generationId(),
                persona.versionId(),
                answers,
                NOW);

        TaskSubmission stored = submissions.insert(submission);

        assertThat(stored.answers())
                .extracting(TaskSubmissionAnswer::finalAnswerValue)
                .containsExactlyElementsOf(answers.stream()
                        .map(TaskSubmissionAnswer::finalAnswerValue)
                        .toList());
    }

    @Test
    void exposesOptimisticVersionAndSerializesPessimisticAdminLock() throws Exception {
        TransactionTemplate transactions =
                new TransactionTemplate(transactionManager);
        TaskFixture fixture = draftTask();
        transactions.executeWithoutResult(status -> tasks.save(fixture.task()));

        TaskJpaEntity stale = transactions.execute(status -> {
            TaskJpaEntity entity = entityManager.find(
                    TaskJpaEntity.class, fixture.task().id().value());
            entityManager.detach(entity);
            return entity;
        });
        transactions.executeWithoutResult(status -> {
            Task current = tasks.findById(fixture.task().id()).orElseThrow();
            current.replaceContent(
                    "최신 관리자 수정",
                    current.description(),
                    current.questions(),
                    NOW.plusSeconds(1));
            tasks.save(current);
        });
        stale.apply(Task.draft(
                fixture.task().id(),
                "뒤늦은 관리자 수정",
                fixture.task().description(),
                fixture.task().questions(),
                fixture.task().createdAt()));
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            entityManager.merge(stale);
            entityManager.flush();
        })).isInstanceOf(OptimisticLockException.class);

        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> holder = pool.submit(() -> transactions.executeWithoutResult(
                    status -> {
                        tasks.findByIdForUpdate(fixture.task().id()).orElseThrow();
                        locked.countDown();
                        await(release);
                    }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            Future<?> contender = pool.submit(() ->
                    transactions.executeWithoutResult(status ->
                            tasks.findByIdForUpdate(
                                    fixture.task().id()).orElseThrow()));

            assertThatThrownBy(() -> contender.get(300, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            release.countDown();
            holder.get(5, TimeUnit.SECONDS);
            contender.get(5, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    private TaskFixture draftTask() {
        TaskId taskId = new TaskId(UUID.randomUUID());
        TaskQuestionId choiceQuestionId =
                new TaskQuestionId(UUID.randomUUID());
        TaskOptionId firstOptionId = new TaskOptionId(UUID.randomUUID());
        TaskOptionId secondOptionId = new TaskOptionId(UUID.randomUUID());
        List<TaskQuestion> questions = List.of(
                new TaskQuestion(
                        choiceQuestionId,
                        1,
                        TaskQuestionType.SINGLE_CHOICE,
                        "이 과업에 찬성하나요?",
                        "가장 가까운 선택지를 골라주세요.",
                        new SingleChoiceConstraint(),
                        List.of(
                                TaskOption.standard(firstOptionId, 1, "찬성"),
                                TaskOption.standard(secondOptionId, 2, "반대"))));
        return new TaskFixture(
                Task.draft(
                        taskId,
                        "사용자 선호 과업",
                        "JPA 왕복 테스트용 과업",
                        questions,
                        NOW.minusSeconds(30)),
                choiceQuestionId,
                firstOptionId,
                secondOptionId);
    }

    private TaskFixture openTask() {
        TaskFixture draft = draftTask();
        Task open = Task.restore(
                draft.task().id(),
                draft.task().title(),
                draft.task().description(),
                draft.task().questions(),
                TaskStatus.OPEN,
                new TaskSchedule(
                        NOW.minusSeconds(20), NOW.plusSeconds(3600)),
                NOW.minusSeconds(30),
                NOW.minusSeconds(20),
                null,
                null,
                NOW.minusSeconds(40),
                NOW.minusSeconds(20));
        return new TaskFixture(
                open,
                draft.choiceQuestionId(),
                draft.firstOptionId(),
                draft.secondOptionId());
    }

    private TaskPrediction succeededPrediction(
            TaskFixture fixture,
            TaskUserId userId,
            PersonaFixture persona,
            UUID predictionUuid
    ) {
        TaskPredictionId predictionId =
                new TaskPredictionId(predictionUuid);
        List<TaskPredictedReason> candidates = List.of(
                new TaskPredictedReason(
                        new TaskPredictedReasonId(UUID.randomUUID()),
                        predictionId,
                        fixture.firstOptionId(),
                        1,
                        "찬성을 선택할 가능성이 높습니다."),
                new TaskPredictedReason(
                        new TaskPredictedReasonId(UUID.randomUUID()),
                        predictionId,
                        fixture.firstOptionId(),
                        2,
                        "찬성의 두 번째 예상 이유입니다."),
                new TaskPredictedReason(
                        new TaskPredictedReasonId(UUID.randomUUID()),
                        predictionId,
                        fixture.secondOptionId(),
                        1,
                        "반대를 선택할 가능성도 있습니다."),
                new TaskPredictedReason(
                        new TaskPredictedReasonId(UUID.randomUUID()),
                        predictionId,
                        fixture.secondOptionId(),
                        2,
                        "반대의 두 번째 예상 이유입니다."));
        return TaskPrediction.restore(
                predictionId,
                userId,
                fixture.task(),
                persona.generationId(),
                persona.versionId(),
                persona.personaId(),
                "policy-v1",
                TaskPredictionStatus.SUCCEEDED,
                1,
                candidates,
                null,
                null,
                NOW.minusSeconds(5),
                NOW.minusSeconds(4),
                NOW.minusSeconds(3));
    }

    private PersonaFixture insertSucceededPersona(String userId) {
        long version = SURVEY_VERSION.incrementAndGet();
        UUID contentId = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        UUID generationId = UUID.randomUUID();
        String personaId = "persona-" + generationId;
        Timestamp createdAt = Timestamp.from(NOW.minusSeconds(100));
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, ?, 'admin', ?, 'admin', ?,
                    'admin', ?)
                """, contentId, version, "Task test survey " + version,
                createdAt, createdAt, createdAt);
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    scheduled_at, canceled_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'CANCELED', ?, ?, 'admin', ?, 0)
                """, roundId, version, contentId,
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
        return new PersonaFixture(
                new TaskPersonaGenerationId(generationId),
                new TaskPersonaVersionId(UUID.randomUUID()),
                new TaskPersonaId(personaId));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("timed out waiting for latch");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private record TaskFixture(
            Task task,
            TaskQuestionId choiceQuestionId,
            TaskOptionId firstOptionId,
            TaskOptionId secondOptionId
    ) {
    }

    private record PersonaFixture(
            TaskPersonaGenerationId generationId,
            TaskPersonaVersionId versionId,
            TaskPersonaId personaId
    ) {
    }
}
