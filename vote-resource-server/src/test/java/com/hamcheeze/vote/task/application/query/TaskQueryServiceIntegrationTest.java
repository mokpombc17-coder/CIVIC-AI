package com.hamcheeze.vote.task.application.query;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.TaskPredictionRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.port.out.TaskSubmissionRepository;
import com.hamcheeze.vote.task.domain.answer.ShortTextValue;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionCandidateId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.prediction.TaskPrediction;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import com.hamcheeze.vote.task.domain.submission.AcceptTaskPredictionCandidate;
import com.hamcheeze.vote.task.domain.submission.TaskAnswerSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.ALREADY_SUBMITTED;
import static com.hamcheeze.vote.task.application.query.TaskPredictionQueryService.TaskPredictionViewState.SUCCEEDED;
import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=false"
})
@ActiveProfiles({"local", "test"})
class TaskQueryServiceIntegrationTest {

    private static final AtomicLong SURVEY_SEQUENCE = new AtomicLong();
    private static final TaskActorId ADMIN = new TaskActorId("admin");

    @Autowired
    private UserTaskQueryService userTasks;

    @Autowired
    private TaskPredictionQueryService predictionQueries;

    @Autowired
    private MyTaskSubmissionQueryService mySubmissions;

    @Autowired
    private AdminTaskQueryService adminTasks;

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private TaskPredictionRepository predictions;

    @Autowired
    private TaskSubmissionRepository submissions;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetDatabase() {
        jdbcTemplate.execute("TRUNCATE TABLE tasks CASCADE");
        jdbcTemplate.execute(
                "TRUNCATE TABLE survey_content_versions CASCADE");
    }

    @Test
    void persistedDataProducesCompleteUserPredictionSubmissionAndAdminViews() {
        Instant now = Instant.now();
        TaskUserId userId = new TaskUserId("query-it-" + UUID.randomUUID());
        TaskQuestion question = new TaskQuestion(
                new TaskQuestionId(UUID.randomUUID()),
                1,
                TaskQuestionType.SHORT_TEXT,
                "통합 조회 질문",
                null,
                ShortTextConstraint.defaults(),
                List.of());
        Task task = Task.draft(
                new TaskId(UUID.randomUUID()),
                "통합 조회 과업",
                "조회 모델 검증",
                List.of(question),
                now.minus(30, ChronoUnit.SECONDS));
        TaskLifecycleHistory opened = task.openImmediately(
                new TaskLifecycleHistoryId(UUID.randomUUID()),
                now.plus(1, ChronoUnit.HOURS),
                ADMIN,
                "통합 테스트 공개",
                now.minus(20, ChronoUnit.SECONDS));
        Task storedTask = tasks.save(task);
        tasks.appendLifecycleHistory(List.of(opened));

        PersonaFixture persona = insertSucceededPersona(
                userId.value(), now.minus(25, ChronoUnit.SECONDS));
        TaskPrediction prediction = succeededPrediction(
                userId, storedTask, persona, now);
        prediction = predictions.insert(prediction);

        var openTasks = userTasks.findOpenTasks(userId);
        var beforeSubmission = predictionQueries.findCurrent(
                userId, storedTask.id());

        assertThat(openTasks).singleElement().satisfies(summary -> {
            assertThat(summary.taskId()).isEqualTo(storedTask.id());
            assertThat(summary.closesAt())
                    .isEqualTo(storedTask.schedule().scheduledCloseAt());
            assertThat(summary.submission().submitted()).isFalse();
        });
        assertThat(beforeSubmission.state()).isEqualTo(SUCCEEDED);
        assertThat(beforeSubmission.submissionAllowed()).isTrue();
        assertThat(beforeSubmission.allowedAnswerSources()).containsExactly(
                TaskAnswerSource.AI_ACCEPTED,
                TaskAnswerSource.USER_ANSWERED);
        assertThat(beforeSubmission.candidates()).hasSize(2);

        TaskSubmission submission = TaskSubmission.create(
                new TaskSubmissionId(UUID.randomUUID()),
                userId,
                storedTask,
                prediction,
                persona.generationId(),
                List.of(new AcceptTaskPredictionCandidate(
                        question.id(),
                        prediction.candidates().getFirst().id())),
                now);
        submission = submissions.insert(submission);

        var detail = userTasks.findOpenTask(
                userId, storedTask.id()).orElseThrow();
        var predictionAfter = predictionQueries.findCurrent(
                userId, storedTask.id());
        var mine = mySubmissions.findById(
                userId, submission.id()).orElseThrow();
        var admin = adminTasks.findById(storedTask.id()).orElseThrow();

        assertThat(detail.submission().submitted()).isTrue();
        assertThat(detail.submission().submissionId())
                .isEqualTo(submission.id());
        assertThat(predictionAfter.state()).isEqualTo(ALREADY_SUBMITTED);
        assertThat(predictionAfter.submissionId()).isEqualTo(submission.id());
        assertThat(mine.answers()).singleElement().satisfies(answer -> {
            assertThat(answer.question().content())
                    .isEqualTo("통합 조회 질문");
            assertThat(answer.source()).isEqualTo(
                    TaskAnswerSource.AI_ACCEPTED);
            assertThat(answer.adoptedCandidate().rationale())
                    .isEqualTo("통합 예상 근거 1");
        });
        assertThat(admin.task().id()).isEqualTo(storedTask.id());
        assertThat(admin.lifecycleHistory()).singleElement()
                .isEqualTo(opened);
    }

    private TaskPrediction succeededPrediction(
            TaskUserId userId,
            Task task,
            PersonaFixture persona,
            Instant now
    ) {
        TaskPredictionId predictionId = new TaskPredictionId(UUID.randomUUID());
        TaskPrediction prediction = TaskPrediction.pending(
                predictionId,
                userId,
                task.id(),
                persona.generationId(),
                persona.personaId(),
                "policy-v1",
                2,
                now.minus(15, ChronoUnit.SECONDS));
        prediction.startProcessing(
                new TaskPredictionRetryPolicy(
                        Duration.ofSeconds(60),
                        2,
                        Duration.ofSeconds(30)),
                now.minus(14, ChronoUnit.SECONDS));
        prediction.succeed(
                task,
                List.of(
                        candidate(predictionId, task, 1),
                        candidate(predictionId, task, 2)),
                now.minus(13, ChronoUnit.SECONDS));
        return prediction;
    }

    private TaskPredictionCandidate candidate(
            TaskPredictionId predictionId,
            Task task,
            int order
    ) {
        return new TaskPredictionCandidate(
                new TaskPredictionCandidateId(UUID.randomUUID()),
                predictionId,
                task.questions().getFirst().id(),
                order,
                new ShortTextValue("통합 예상 답변 " + order),
                "통합 예상 근거 " + order);
    }

    private PersonaFixture insertSucceededPersona(
            String userId,
            Instant submittedAt
    ) {
        long sequence = SURVEY_SEQUENCE.incrementAndGet();
        UUID contentId = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        UUID generationId = UUID.randomUUID();
        String personaId = "persona-" + generationId;
        Timestamp timestamp = Timestamp.from(submittedAt);
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, ?, 'admin', ?, 'admin', ?,
                    'admin', ?)
                """, contentId, sequence,
                "Task query survey " + sequence,
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
                    generation_id, survey_response_id, persona_id, status,
                    attempt_count, created_at, processing_started_at,
                    completed_at, updated_at)
                VALUES (?, ?, ?, 'SUCCEEDED', 1, ?, ?, ?, ?)
                """, generationId, responseId, personaId,
                timestamp, timestamp, timestamp, timestamp);
        return new PersonaFixture(
                new TaskPersonaGenerationId(generationId),
                new TaskPersonaId(personaId));
    }

    private record PersonaFixture(
            TaskPersonaGenerationId generationId,
            TaskPersonaId personaId
    ) {
    }
}
