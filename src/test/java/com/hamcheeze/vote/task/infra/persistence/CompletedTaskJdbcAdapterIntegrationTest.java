package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.task.application.port.out.CompletedTaskReader;
import com.hamcheeze.vote.task.application.port.out.ParticipatedTaskReader;
import com.hamcheeze.vote.task.application.port.out.TaskSearchReader;
import com.hamcheeze.vote.task.application.query.CompletedTaskCursor;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskCursor;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskLifecycleStatus;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskQueryService;
import com.hamcheeze.vote.task.application.query.ParticipatedTaskResultStatus;
import com.hamcheeze.vote.task.application.query.TaskSearchCursor;
import com.hamcheeze.vote.task.application.query.UserTaskQueryService;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.prediction.enabled=false"
})
@ActiveProfiles({"local", "test"})
@Transactional
class CompletedTaskJdbcAdapterIntegrationTest {

    private static final AtomicLong SURVEY_SEQUENCE =
            new AtomicLong(800_000L);

    @Autowired
    private CompletedTaskReader completedTasks;

    @Autowired
    private ParticipatedTaskReader participatedTasks;

    @Autowired
    private TaskSearchReader taskSearch;

    @Autowired
    private UserTaskQueryService openTaskQueries;

    @Autowired
    private ParticipatedTaskQueryService participatedTaskQueries;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void taskSearchCombinesAllOpenWithOnlyUsersFinalizedClosedTasks() {
        Instant base = Instant.parse("2026-08-27T12:00:00Z");
        TaskUserId userId = new TaskUserId("task-search-reader-user");
        PersonaFixture persona = insertSucceededPersona(
                userId.value(), base.minus(1, ChronoUnit.DAYS));

        UUID openSoon = UUID.fromString(
                "09000000-0000-0000-0000-000000000001");
        insertTask(
                openSoon, "교통 정책 진행 중", null, "OPEN", null,
                base.minus(2, ChronoUnit.HOURS),
                base.plus(1, ChronoUnit.HOURS), null);

        UUID openLater = UUID.fromString(
                "09000000-0000-0000-0000-000000000002");
        insertTask(
                openLater, "진행 중 투표", "교통 정책 설명", "OPEN", null,
                base.minus(1, ChronoUnit.HOURS),
                base.plus(2, ChronoUnit.HOURS), null);
        UUID openSubmission = insertSubmission(
                userId.value(), persona, openLater,
                base.minus(30, ChronoUnit.MINUTES));

        UUID finalizedClosed = UUID.fromString(
                "09000000-0000-0000-0000-000000000003");
        insertClosedTask(
                finalizedClosed, "교통 정책 완료", null,
                TaskClosureType.DEADLINE_REACHED,
                base.minus(1, ChronoUnit.HOURS), true);
        UUID closedSubmission = insertSubmission(
                userId.value(), persona, finalizedClosed,
                base.minus(2, ChronoUnit.HOURS));

        UUID awaitingResult = UUID.fromString(
                "09000000-0000-0000-0000-000000000004");
        insertClosedTask(
                awaitingResult, "교통 정책 집계 중", null,
                TaskClosureType.EARLY_CLOSED,
                base.minus(2, ChronoUnit.HOURS), false);
        insertSubmission(
                userId.value(), persona, awaitingResult,
                base.minus(3, ChronoUnit.HOURS));

        UUID expiredOpen = UUID.fromString(
                "09000000-0000-0000-0000-000000000005");
        insertTask(
                expiredOpen, "교통 정책 마감 대기", null, "OPEN", null,
                base.minus(2, ChronoUnit.HOURS),
                base.minus(1, ChronoUnit.MINUTES), null);

        List<TaskSearchReader.TaskSearchRow> first = taskSearch.findByUser(
                userId, "교통 정책", Optional.empty(), base, 2);
        TaskSearchReader.TaskSearchRow lastOpen = first.getLast();
        List<TaskSearchReader.TaskSearchRow> second = taskSearch.findByUser(
                userId,
                "교통 정책",
                Optional.of(new TaskSearchCursor(
                        "a".repeat(64), "b".repeat(64),
                        lastOpen.taskStatus(), lastOpen.sortAt(),
                        lastOpen.taskId())),
                base,
                2);

        assertThat(first).extracting(row -> row.taskId().value())
                .containsExactly(openSoon, openLater);
        assertThat(first.getFirst().submissionId()).isNull();
        assertThat(first.getLast().submissionId().value())
                .isEqualTo(openSubmission);
        assertThat(first).allMatch(row -> !row.resultAvailable());
        assertThat(second).singleElement().satisfies(row -> {
            assertThat(row.taskId().value()).isEqualTo(finalizedClosed);
            assertThat(row.taskStatus()).isEqualTo(TaskStatus.CLOSED);
            assertThat(row.submissionId().value())
                    .isEqualTo(closedSubmission);
            assertThat(row.resultAvailable()).isTrue();
        });
    }

    @Test
    void returnsOnlyFinalizedCompletedTasksSubmittedByTheUser() {
        Instant base = Instant.parse("2026-08-27T12:00:00Z");
        TaskUserId userId = new TaskUserId("completed-reader-user");
        PersonaFixture persona = insertSucceededPersona(
                userId.value(), base.minus(1, ChronoUnit.DAYS));

        UUID included = UUID.fromString(
                "10000000-0000-0000-0000-000000000001");
        insertClosedTask(
                included,
                "참여 완료 Task",
                "결과가 확정된 Task",
                TaskClosureType.DEADLINE_REACHED,
                base,
                true);
        UUID includedSubmission = insertSubmission(
                userId.value(), persona, included,
                base.minus(1, ChronoUnit.HOURS));

        UUID noManifest = UUID.fromString(
                "10000000-0000-0000-0000-000000000002");
        insertClosedTask(
                noManifest,
                "미확정 Task",
                null,
                TaskClosureType.EARLY_CLOSED,
                base.minus(1, ChronoUnit.HOURS),
                false);
        insertSubmission(
                userId.value(), persona, noManifest,
                base.minus(2, ChronoUnit.HOURS));

        UUID cancelled = UUID.fromString(
                "10000000-0000-0000-0000-000000000003");
        insertClosedTask(
                cancelled,
                "취소 Task",
                null,
                TaskClosureType.CANCELLED,
                base.minus(2, ChronoUnit.HOURS),
                true);
        insertSubmission(
                userId.value(), persona, cancelled,
                base.minus(3, ChronoUnit.HOURS));

        UUID missedSchedule = UUID.fromString(
                "10000000-0000-0000-0000-000000000006");
        insertMissedTask(
                missedSchedule,
                "스케줄 누락 Task",
                base.minus(3, ChronoUnit.HOURS),
                true);
        insertSubmission(
                userId.value(), persona, missedSchedule,
                base.minus(4, ChronoUnit.HOURS));

        UUID open = UUID.fromString(
                "10000000-0000-0000-0000-000000000004");
        insertOpenTask(open, "진행 중 Task", base, true);
        insertSubmission(
                userId.value(), persona, open,
                base.minus(4, ChronoUnit.HOURS));

        TaskUserId otherUser = new TaskUserId("completed-reader-other");
        PersonaFixture otherPersona = insertSucceededPersona(
                otherUser.value(), base.minus(1, ChronoUnit.DAYS));
        UUID otherTask = UUID.fromString(
                "10000000-0000-0000-0000-000000000005");
        insertClosedTask(
                otherTask,
                "다른 사용자 Task",
                null,
                TaskClosureType.DEADLINE_REACHED,
                base.plus(1, ChronoUnit.HOURS),
                true);
        insertSubmission(
                otherUser.value(), otherPersona, otherTask,
                base.minus(1, ChronoUnit.HOURS));

        List<CompletedTaskReader.CompletedTaskRow> rows =
                completedTasks.findByUser(userId, Optional.empty(), 20);

        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.taskId()).isEqualTo(new TaskId(included));
            assertThat(row.title()).isEqualTo("참여 완료 Task");
            assertThat(row.description()).isEqualTo("결과가 확정된 Task");
            assertThat(row.openedAt()).isEqualTo(
                    base.minus(2, ChronoUnit.HOURS));
            assertThat(row.closedAt()).isEqualTo(base);
            assertThat(row.closureType())
                    .isEqualTo(TaskClosureType.DEADLINE_REACHED);
            assertThat(row.submissionId().value())
                    .isEqualTo(includedSubmission);
            assertThat(row.submittedAt()).isEqualTo(
                    base.minus(1, ChronoUnit.HOURS));
        });
    }

    @Test
    void appliesStableDescendingKeysetAndLimit() {
        Instant base = Instant.parse("2026-08-27T12:00:00Z");
        TaskUserId userId = new TaskUserId("completed-reader-page");
        PersonaFixture persona = insertSucceededPersona(
                userId.value(), base.minus(1, ChronoUnit.DAYS));
        UUID newest = UUID.fromString(
                "20000000-0000-0000-0000-000000000001");
        UUID tieHigh = UUID.fromString(
                "20000000-0000-0000-0000-000000000003");
        UUID tieLow = UUID.fromString(
                "20000000-0000-0000-0000-000000000002");
        UUID oldest = UUID.fromString(
                "20000000-0000-0000-0000-000000000009");
        UUID finalItem = UUID.fromString(
                "20000000-0000-0000-0000-000000000008");

        insertCompletedSubmission(
                userId, persona, newest, base, "newest");
        insertCompletedSubmission(
                userId, persona, tieHigh,
                base.minus(1, ChronoUnit.HOURS), "tie-high");
        insertCompletedSubmission(
                userId, persona, tieLow,
                base.minus(1, ChronoUnit.HOURS), "tie-low");
        insertCompletedSubmission(
                userId, persona, oldest,
                base.minus(2, ChronoUnit.HOURS), "oldest");
        insertCompletedSubmission(
                userId, persona, finalItem,
                base.minus(3, ChronoUnit.HOURS), "final-item");

        List<CompletedTaskReader.CompletedTaskRow> first =
                completedTasks.findByUser(userId, Optional.empty(), 2);
        List<CompletedTaskReader.CompletedTaskRow> second =
                completedTasks.findByUser(
                        userId,
                        Optional.of(new CompletedTaskCursor(
                                first.getLast().closedAt(),
                                first.getLast().taskId())),
                        2);
        List<CompletedTaskReader.CompletedTaskRow> third =
                completedTasks.findByUser(
                        userId,
                        Optional.of(new CompletedTaskCursor(
                                second.getLast().closedAt(),
                                second.getLast().taskId())),
                        2);
        List<CompletedTaskReader.CompletedTaskRow> afterLast =
                completedTasks.findByUser(
                        userId,
                        Optional.of(new CompletedTaskCursor(
                                third.getLast().closedAt(),
                                third.getLast().taskId())),
                        2);

        assertThat(first).extracting(row -> row.taskId().value())
                .containsExactly(newest, tieHigh);
        assertThat(second).extracting(row -> row.taskId().value())
                .containsExactly(tieLow, oldest);
        assertThat(third).extracting(row -> row.taskId().value())
                .containsExactly(finalItem);
        assertThat(afterLast).isEmpty();
    }

    @Test
    void participatedReaderKeepsEverySubmissionSearchableAndStable() {
        Instant base = Instant.parse("2026-08-27T12:00:00Z");
        TaskUserId userId = new TaskUserId("participated-reader-user");
        PersonaFixture persona = insertSucceededPersona(
                userId.value(), base.minus(1, ChronoUnit.DAYS));

        UUID open = UUID.fromString(
                "21000000-0000-0000-0000-000000000004");
        insertOpenTask(
                open, "환경 진행 중 Task",
                base.minus(2, ChronoUnit.HOURS), false);
        Instant openSubmittedAt = base.minus(10, ChronoUnit.MINUTES);
        insertSubmission(userId.value(), persona, open, openSubmittedAt);

        UUID closing = UUID.fromString(
                "21000000-0000-0000-0000-000000000005");
        insertTask(
                closing,
                "마감 처리 대기 Task",
                null,
                "OPEN",
                null,
                base.minus(2, ChronoUnit.HOURS),
                base.minus(1, ChronoUnit.MINUTES),
                null);
        insertSubmission(
                userId.value(), persona, closing,
                base.minus(15, ChronoUnit.MINUTES));

        UUID finalized = UUID.fromString(
                "21000000-0000-0000-0000-000000000003");
        insertClosedTask(
                finalized, "환경 결과 Task", "검색 가능한 결과",
                TaskClosureType.DEADLINE_REACHED,
                base.minus(1, ChronoUnit.HOURS), true);
        Instant finalizedSubmittedAt = base.minus(20, ChronoUnit.MINUTES);
        insertSubmission(
                userId.value(), persona, finalized, finalizedSubmittedAt);

        UUID cancelled = UUID.fromString(
                "21000000-0000-0000-0000-000000000002");
        insertClosedTask(
                cancelled, "취소된 참여 Task", null,
                TaskClosureType.CANCELLED,
                base.minus(30, ChronoUnit.MINUTES), false);
        Instant cancelledSubmittedAt = base.minus(30, ChronoUnit.MINUTES);
        insertSubmission(
                userId.value(), persona, cancelled, cancelledSubmittedAt);

        UUID awaitingResult = UUID.fromString(
                "21000000-0000-0000-0000-000000000001");
        insertClosedTask(
                awaitingResult, "집계 대기 Task", null,
                TaskClosureType.EARLY_CLOSED,
                base.minus(40, ChronoUnit.MINUTES), false);
        insertSubmission(
                userId.value(), persona, awaitingResult,
                base.minus(40, ChronoUnit.MINUTES));

        UUID missed = UUID.fromString(
                "21000000-0000-0000-0000-000000000006");
        insertMissedTask(
                missed, "일정 미진행 참여 Task",
                base.minus(50, ChronoUnit.MINUTES), false);
        insertSubmission(
                userId.value(), persona, missed,
                base.minus(50, ChronoUnit.MINUTES));

        TaskUserId otherUser = new TaskUserId("participated-reader-other");
        PersonaFixture otherPersona = insertSucceededPersona(
                otherUser.value(), base.minus(1, ChronoUnit.DAYS));
        UUID otherTask = UUID.fromString(
                "21000000-0000-0000-0000-000000000009");
        insertOpenTask(
                otherTask, "다른 사용자 Task",
                base.minus(2, ChronoUnit.HOURS), false);
        insertSubmission(
                otherUser.value(), otherPersona, otherTask,
                base.minus(5, ChronoUnit.MINUTES));

        List<ParticipatedTaskReader.ParticipatedTaskRow> first =
                participatedTasks.findByUser(
                        userId, null, Optional.empty(), 4);
        List<ParticipatedTaskReader.ParticipatedTaskRow> second =
                participatedTasks.findByUser(
                        userId,
                        null,
                        Optional.of(new ParticipatedTaskCursor(
                                "a".repeat(64),
                                first.getLast().submittedAt(),
                                first.getLast().taskId())),
                        4);
        List<ParticipatedTaskReader.ParticipatedTaskRow> searched =
                participatedTasks.findByUser(
                        userId, "검색 가능한", Optional.empty(), 10);

        assertThat(first).extracting(row -> row.taskId().value())
                .containsExactly(open, closing, finalized, cancelled);
        assertThat(second).extracting(row -> row.taskId().value())
                .containsExactly(awaitingResult, missed);
        assertThat(searched).singleElement().satisfies(row -> {
            assertThat(row.taskId()).isEqualTo(new TaskId(finalized));
            assertThat(row.taskStatus()).isEqualTo(TaskStatus.CLOSED);
            assertThat(row.closureType())
                    .isEqualTo(TaskClosureType.DEADLINE_REACHED);
            assertThat(row.resultVersion()).isEqualTo(1);
            assertThat(row.finalizedAt())
                    .isEqualTo(base.minus(1, ChronoUnit.HOURS));
        });
        assertThat(first.getFirst().resultVersion()).isNull();
        assertThat(first.get(3).closureType())
                .isEqualTo(TaskClosureType.CANCELLED);
        assertThat(second.get(1).openedAt()).isNull();
        assertThat(second.get(1).closureType())
                .isEqualTo(TaskClosureType.MISSED_SCHEDULE);
    }

    @Test
    void submittedOpenTaskIsConsistentAcrossFrontendListQueries() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        TaskUserId userId = new TaskUserId("task-list-flow-user");
        PersonaFixture persona = insertSucceededPersona(
                userId.value(), now.minus(1, ChronoUnit.DAYS));
        UUID taskId = UUID.fromString(
                "22000000-0000-0000-0000-000000000001");
        insertOpenTask(
                taskId,
                "교차 흐름 환경 과업",
                now.minus(1, ChronoUnit.HOURS),
                false);
        UUID submissionId = insertSubmission(
                userId.value(),
                persona,
                taskId,
                now.minus(5, ChronoUnit.MINUTES));

        List<UserTaskQueryService.UserTaskSummary> openItems =
                openTaskQueries.findOpenTasks(userId);
        ParticipatedTaskQueryService.ParticipatedTaskPage participatedPage =
                participatedTaskQueries.findByUser(
                        userId, "교차 흐름", null, 20);

        assertThat(openItems).singleElement().satisfies(item -> {
            assertThat(item.taskId()).isEqualTo(new TaskId(taskId));
            assertThat(item.submission().submitted()).isTrue();
            assertThat(item.submission().submissionId().value())
                    .isEqualTo(submissionId);
        });
        assertThat(participatedPage.items()).singleElement().satisfies(item -> {
            assertThat(item.taskId()).isEqualTo(new TaskId(taskId));
            assertThat(item.taskStatus())
                    .isEqualTo(ParticipatedTaskLifecycleStatus.OPEN);
            assertThat(item.participation().submissionId().value())
                    .isEqualTo(submissionId);
            assertThat(item.result().status())
                    .isEqualTo(ParticipatedTaskResultStatus.NOT_AVAILABLE);
        });
    }

    @Test
    void rejectsNonPositiveLimit() {
        assertThatThrownBy(() -> completedTasks.findByUser(
                new TaskUserId("completed-reader-limit"),
                Optional.empty(),
                0))
                .isInstanceOf(InvalidDataAccessApiUsageException.class)
                .hasCauseInstanceOf(IllegalArgumentException.class)
                .hasMessage("limit must be positive");
    }

    private void insertCompletedSubmission(
            TaskUserId userId,
            PersonaFixture persona,
            UUID taskId,
            Instant closedAt,
            String title
    ) {
        insertClosedTask(
                taskId,
                title,
                null,
                TaskClosureType.DEADLINE_REACHED,
                closedAt,
                true);
        insertSubmission(
                userId.value(),
                persona,
                taskId,
                closedAt.minus(30, ChronoUnit.MINUTES));
    }

    private void insertClosedTask(
            UUID taskId,
            String title,
            String description,
            TaskClosureType closureType,
            Instant closedAt,
            boolean finalized
    ) {
        Instant openedAt = closedAt.minus(2, ChronoUnit.HOURS);
        Instant scheduledCloseAt = closureType
                == TaskClosureType.DEADLINE_REACHED
                ? closedAt.minus(1, ChronoUnit.MINUTES)
                : closedAt.plus(1, ChronoUnit.HOURS);
        insertTask(
                taskId,
                title,
                description,
                "CLOSED",
                closureType.name(),
                openedAt,
                scheduledCloseAt,
                closedAt);
        if (finalized) {
            insertManifest(taskId, closedAt);
        }
    }

    private void insertOpenTask(
            UUID taskId,
            String title,
            Instant openedAt,
            boolean finalized
    ) {
        insertTask(
                taskId,
                title,
                null,
                "OPEN",
                null,
                openedAt,
                openedAt.plus(1, ChronoUnit.DAYS),
                null);
        if (finalized) {
            insertManifest(taskId, openedAt.plus(1, ChronoUnit.HOURS));
        }
    }

    private void insertMissedTask(
            UUID taskId,
            String title,
            Instant closedAt,
            boolean finalized
    ) {
        Instant scheduledOpenAt = closedAt.minus(2, ChronoUnit.HOURS);
        Instant scheduledCloseAt = closedAt.minus(1, ChronoUnit.MINUTES);
        Instant createdAt = scheduledOpenAt.minus(1, ChronoUnit.HOURS);
        jdbcTemplate.update("""
                INSERT INTO tasks (
                    task_id, row_version, title, description, status,
                    scheduled_open_at, scheduled_close_at,
                    published_at, opened_at, closed_at, closure_type,
                    created_at, updated_at)
                VALUES (?, 0, ?, NULL, 'CLOSED', ?, ?, ?, NULL, ?,
                    'MISSED_SCHEDULE', ?, ?)
                """,
                taskId,
                title,
                Timestamp.from(scheduledOpenAt),
                Timestamp.from(scheduledCloseAt),
                Timestamp.from(scheduledOpenAt),
                Timestamp.from(closedAt),
                Timestamp.from(createdAt),
                Timestamp.from(closedAt));
        insertQuestionAndOption(taskId);
        if (finalized) {
            insertManifest(taskId, closedAt);
        }
    }

    private void insertTask(
            UUID taskId,
            String title,
            String description,
            String status,
            String closureType,
            Instant openedAt,
            Instant scheduledCloseAt,
            Instant closedAt
    ) {
        Instant createdAt = openedAt.minus(1, ChronoUnit.HOURS);
        Instant updatedAt = closedAt == null ? openedAt : closedAt;
        jdbcTemplate.update("""
                INSERT INTO tasks (
                    task_id, row_version, title, description, status,
                    scheduled_open_at, scheduled_close_at,
                    published_at, opened_at, closed_at, closure_type,
                    created_at, updated_at)
                VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                taskId,
                title,
                description,
                status,
                Timestamp.from(openedAt),
                Timestamp.from(scheduledCloseAt),
                Timestamp.from(openedAt),
                Timestamp.from(openedAt),
                closedAt == null ? null : Timestamp.from(closedAt),
                closureType,
                Timestamp.from(createdAt),
                Timestamp.from(updatedAt));
        insertQuestionAndOption(taskId);
    }

    private void insertQuestionAndOption(UUID taskId) {
        jdbcTemplate.update("""
                INSERT INTO task_questions (
                    question_id, task_id, type, content, display_order)
                VALUES (?, ?, 'SINGLE_CHOICE', '완료 목록 테스트 질문', 1)
                """,
                questionId(taskId),
                taskId);
        jdbcTemplate.update("""
                INSERT INTO task_options (
                    option_id, task_id, question_id, question_type,
                    kind, content, display_order)
                VALUES (?, ?, ?, 'SINGLE_CHOICE', 'STANDARD', '선택지', 1)
                """,
                optionId(taskId),
                taskId,
                questionId(taskId));
        jdbcTemplate.update("""
                INSERT INTO task_options (
                    option_id, task_id, question_id, question_type,
                    kind, content, display_order)
                VALUES (?, ?, ?, 'SINGLE_CHOICE', 'STANDARD', '다른 선택지', 2)
                """,
                secondOptionId(taskId),
                taskId,
                questionId(taskId));
    }

    private UUID insertSubmission(
            String userId,
            PersonaFixture persona,
            UUID taskId,
            Instant submittedAt
    ) {
        UUID submissionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO task_submissions (
                    submission_id, user_id, task_id,
                    persona_generation_id,
                    prediction_id, submitted_at,
                    question_id, selected_option_id,
                    reason_source, accepted_predicted_reason_id,
                    final_reason)
                VALUES (?, ?, ?, ?, NULL, ?, ?, ?,
                    'USER_WRITTEN', NULL, '직접 작성 이유')
                """,
                submissionId,
                userId,
                taskId,
                persona.generationId(),
                Timestamp.from(submittedAt),
                questionId(taskId),
                optionId(taskId));
        return submissionId;
    }

    private void insertManifest(UUID taskId, Instant closedAt) {
        jdbcTemplate.update("""
                INSERT INTO task_result_manifests (
                    task_id, result_version, schema_version, closed_at,
                    response_count, body_sha256, finalized_at)
                VALUES (?, 1, 'task-result-view.v1', ?, 1, ?, ?)
                """,
                taskId,
                Timestamp.from(closedAt),
                "0".repeat(64),
                Timestamp.from(closedAt));
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
        String personaId = "completed-reader-" + generationId;
        Timestamp timestamp = Timestamp.from(submittedAt);
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, ?, 'admin', ?, 'admin', ?,
                    'admin', ?)
                """,
                contentId,
                sequence,
                "Completed reader survey " + sequence,
                timestamp,
                timestamp,
                timestamp);
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    scheduled_at, canceled_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'CANCELED', ?, ?, 'admin', ?, 0)
                """,
                roundId,
                sequence,
                contentId,
                timestamp,
                timestamp,
                timestamp);
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id,
                    content_version_id, submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                responseId,
                userId,
                roundId,
                contentId,
                timestamp);
        jdbcTemplate.update("""
                INSERT INTO persona_generations (
                    generation_id, source_type, source_id, persona_id, status,
                    attempt_count, created_at, processing_started_at,
                    completed_at, updated_at)
                VALUES (?, 'SURVEY_RESPONSE', ?, ?, 'SUCCEEDED', 1, ?, ?, ?, ?)
                """,
                generationId,
                responseId,
                personaId,
                timestamp,
                timestamp,
                timestamp,
                timestamp);
        return new PersonaFixture(generationId, personaId);
    }

    private UUID questionId(UUID taskId) {
        return UUID.nameUUIDFromBytes(
                ("question:" + taskId).getBytes(StandardCharsets.UTF_8));
    }

    private UUID optionId(UUID taskId) {
        return UUID.nameUUIDFromBytes(
                ("option:" + taskId).getBytes(StandardCharsets.UTF_8));
    }

    private UUID secondOptionId(UUID taskId) {
        return UUID.nameUUIDFromBytes(
                ("option-2:" + taskId).getBytes(StandardCharsets.UTF_8));
    }

    private record PersonaFixture(
            UUID generationId,
            String personaId
    ) {
    }
}
