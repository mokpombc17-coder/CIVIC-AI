package com.hamcheeze.vote.task.application.task;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.shared.integration.task.TaskOpinionMapFinalizationRequestedV1;
import com.hamcheeze.vote.task.application.port.out.TaskResultManifestRepository;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1;
import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleEventType;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskSchedule;
import com.hamcheeze.vote.task.domain.task.TaskStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "vote.survey.bootstrap.enabled=false",
        "vote.task.lifecycle.enabled=false",
        "vote.task.opinion-map-finalization-outbox.enabled=true"
})
@ActiveProfiles({"local", "test"})
class TaskAdministrationIntegrationTest {

    private static final TaskActorId ADMIN =
            new TaskActorId("admin-task-test");

    @Autowired
    private TaskAdministrationService administration;

    @Autowired
    private TaskRepository tasks;

    @Autowired
    private TaskResultManifestRepository resultManifests;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void createsReplacesAndListsDraftsWithoutPersistingInvalidQuestions() {
        Task created = administration.createDraft(
                new TaskAdministrationService.CreateDraftCommand(
                        "초안 과업",
                        null,
                        choiceQuestion("초기 질문")),
                ADMIN);
        Task replaced = administration.replaceDraft(
                created.id(),
                new TaskAdministrationService.ReplaceDraftCommand(
                        "수정된 초안 과업",
                        "전체 내용을 교체했습니다.",
                        choiceQuestion()),
                ADMIN);

        assertThat(replaced.title()).isEqualTo("수정된 초안 과업");
        assertThat(replaced.questions())
                .singleElement()
                .extracting(TaskQuestion::type)
                .isEqualTo(TaskQuestionType.SINGLE_CHOICE);
        assertThat(administration.findById(created.id()))
                .get()
                .extracting(Task::description)
                .isEqualTo("전체 내용을 교체했습니다.");
        assertThat(administration.findAll())
                .extracting(Task::id)
                .contains(created.id());

        Task emptyDraft = administration.createDraft(
                new TaskAdministrationService.CreateDraftCommand(
                        "작성 중인 빈 초안", null, null),
                ADMIN);
        assertThatThrownBy(() -> administration.schedule(
                emptyDraft.id(),
                futureSchedule(),
                null,
                ADMIN))
                .isInstanceOf(TaskValidationException.class);
        assertThat(administration.findById(emptyDraft.id()))
                .get()
                .extracting(Task::status)
                .isEqualTo(TaskStatus.DRAFT);
        assertThat(tasks.findLifecycleHistory(emptyDraft.id())).isEmpty();
    }

    @Test
    void handlesAdminPublicationScheduleChangesAndTerminalClosureFacts() {
        Task draft = createPublishableDraft("예약 전이 과업");
        Instant firstOpenAt = Instant.now().plus(2, ChronoUnit.HOURS);
        Instant firstCloseAt = firstOpenAt.plus(2, ChronoUnit.HOURS);
        TaskLifecycleChange scheduled = administration.schedule(
                draft.id(),
                new TaskSchedule(firstOpenAt, firstCloseAt),
                "최초 예약",
                ADMIN);
        Instant changedOpenAt = firstOpenAt.plus(1, ChronoUnit.HOURS);
        Instant changedCloseAt = firstCloseAt.plus(1, ChronoUnit.HOURS);
        administration.reschedule(
                draft.id(),
                new TaskSchedule(changedOpenAt, changedCloseAt),
                "공개 일정 변경",
                ADMIN);
        TaskLifecycleChange opened = administration.openScheduledNow(
                draft.id(),
                "조기 공개",
                ADMIN);
        Instant finalCloseAt = Instant.now().plus(3, ChronoUnit.HOURS);
        administration.changeDeadline(
                draft.id(), finalCloseAt, "마감 변경", ADMIN);
        TaskLifecycleChange closed = administration.closeEarly(
                draft.id(), "관리자 조기 종료", ADMIN);

        assertThat(scheduled.task().status())
                .isEqualTo(TaskStatus.SCHEDULED);
        assertThat(opened.task().status()).isEqualTo(TaskStatus.OPEN);
        assertThat(closed.task().status()).isEqualTo(TaskStatus.CLOSED);
        assertThat(closed.task().closureType())
                .isEqualTo(TaskClosureType.EARLY_CLOSED);
        assertThat(tasks.findLifecycleHistory(draft.id()))
                .extracting(history -> history.eventType())
                .containsExactly(
                        TaskLifecycleEventType.SCHEDULED,
                        TaskLifecycleEventType.RESCHEDULED,
                        TaskLifecycleEventType.OPENED,
                        TaskLifecycleEventType.RESCHEDULED,
                        TaskLifecycleEventType.CLOSED);
        assertThat(administration.findClosureFact(draft.id()))
                .get()
                .satisfies(fact -> {
                    assertThat(fact.closureType())
                            .isEqualTo(TaskClosureType.EARLY_CLOSED);
                    assertThat(fact.resultEligible()).isTrue();
                });
        assertThat(opinionMapFinalizationRequestCount(draft.id()))
                .isEqualTo(1);
        assertThat(expectedSubmissionCount(draft.id())).isZero();
        assertThat(resultManifests.findByTaskId(draft.id()))
                .get()
                .satisfies(manifest -> {
                    assertThat(manifest.resultVersion()).isEqualTo(1);
                    assertThat(manifest.schemaVersion())
                            .isEqualTo(TaskResultViewV1.SCHEMA_VERSION);
                    assertThat(manifest.responseCount()).isZero();
                    assertThat(manifest.closedAt())
                            .isEqualTo(closed.task().closedAt());
                    assertThat(manifest.bodySha256())
                            .matches("[0-9a-f]{64}");
                });

        Task immediateDraft = createPublishableDraft("즉시 공개 과업");
        Task openedImmediately = administration.openImmediately(
                        immediateDraft.id(),
                        Instant.now().plus(1, ChronoUnit.HOURS),
                        null,
                        ADMIN)
                .task();
        Task canceled = administration.cancel(
                        immediateDraft.id(),
                        "운영상 취소",
                        ADMIN)
                .task();
        assertThat(openedImmediately.status()).isEqualTo(TaskStatus.OPEN);
        assertThat(canceled.closureType())
                .isEqualTo(TaskClosureType.CANCELLED);
        assertThat(administration.findClosureFact(immediateDraft.id()))
                .get()
                .extracting(TaskClosureFact::resultEligible)
                .isEqualTo(false);
        assertThat(opinionMapFinalizationRequestCount(immediateDraft.id()))
                .isZero();
        assertThat(resultManifests.findByTaskId(immediateDraft.id()))
                .isEmpty();
    }

    @Test
    void schedulerOpensDueTasksClosesDeadlinesAndMarksMissedWindows() {
        Instant now = Instant.now();
        Task scheduledDue = persistLifecycleTask(
                TaskStatus.SCHEDULED,
                now.minus(2, ChronoUnit.MINUTES),
                now.plus(1, ChronoUnit.HOURS));
        Task missed = persistLifecycleTask(
                TaskStatus.SCHEDULED,
                now.minus(2, ChronoUnit.HOURS),
                now.minus(1, ChronoUnit.HOURS));
        Task deadlineReached = persistLifecycleTask(
                TaskStatus.OPEN,
                now.minus(2, ChronoUnit.HOURS),
                now.minus(1, ChronoUnit.MINUTES));
        TaskLifecycleScheduler scheduler = new TaskLifecycleScheduler(
                administration, 100);

        int transitioned = scheduler.transitionAvailable();

        assertThat(transitioned).isGreaterThanOrEqualTo(3);
        assertThat(administration.findById(scheduledDue.id()))
                .get().extracting(Task::status)
                .isEqualTo(TaskStatus.OPEN);
        assertThat(administration.findById(missed.id()))
                .get().satisfies(task -> {
                    assertThat(task.status()).isEqualTo(TaskStatus.CLOSED);
                    assertThat(task.closureType())
                            .isEqualTo(TaskClosureType.MISSED_SCHEDULE);
                    assertThat(task.resultEligible()).isFalse();
                });
        assertThat(administration.findById(deadlineReached.id()))
                .get().satisfies(task -> {
                    assertThat(task.status()).isEqualTo(TaskStatus.CLOSED);
                    assertThat(task.closureType())
                            .isEqualTo(TaskClosureType.DEADLINE_REACHED);
                    assertThat(task.resultEligible()).isTrue();
                });
        assertThat(opinionMapFinalizationRequestCount(deadlineReached.id()))
                .isEqualTo(1);
        assertThat(opinionMapFinalizationRequestCount(missed.id())).isZero();
        assertThat(resultManifests.findByTaskId(deadlineReached.id()))
                .get()
                .satisfies(manifest -> assertThat(manifest.responseCount())
                        .isZero());
        assertThat(resultManifests.findByTaskId(missed.id())).isEmpty();
        assertThat(scheduler.transitionAvailable()).isZero();
    }

    @Test
    void concurrentSchedulerInstancesRecordOnlyOneTransition() throws Exception {
        new TaskLifecycleScheduler(administration, 100)
                .transitionAvailable();
        Instant now = Instant.now();
        Task due = persistLifecycleTask(
                TaskStatus.SCHEDULED,
                now.minus(1, ChronoUnit.MINUTES),
                now.plus(1, ChronoUnit.HOURS));
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> first = executor.submit(() -> {
                start.await();
                return administration.transitionNextDue().isPresent();
            });
            Future<Boolean> second = executor.submit(() -> {
                start.await();
                return administration.transitionNextDue().isPresent();
            });
            start.countDown();

            assertThat(List.of(first.get(), second.get()))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(administration.findById(due.id()))
                .get().extracting(Task::status)
                .isEqualTo(TaskStatus.OPEN);
        assertThat(tasks.findLifecycleHistory(due.id()))
                .singleElement()
                .extracting(history -> history.eventType())
                .isEqualTo(TaskLifecycleEventType.OPENED);
    }

    private Task createPublishableDraft(String title) {
        return administration.createDraft(
                new TaskAdministrationService.CreateDraftCommand(
                        title,
                        null,
                        choiceQuestion("하나를 선택해주세요.")),
                ADMIN);
    }

    private Task persistLifecycleTask(
            TaskStatus status,
            Instant openAt,
            Instant closeAt
    ) {
        Instant createdAt = openAt.minus(1, ChronoUnit.HOURS);
        Task task = Task.restore(
                new TaskId(UUID.randomUUID()),
                "scheduler 대상 " + UUID.randomUUID(),
                null,
                List.of(choiceQuestion("scheduler 질문")),
                status,
                new TaskSchedule(openAt, closeAt),
                createdAt.plus(1, ChronoUnit.MINUTES),
                status == TaskStatus.OPEN ? openAt : null,
                null,
                null,
                createdAt,
                status == TaskStatus.OPEN ? openAt : createdAt.plus(
                        1, ChronoUnit.MINUTES));
        return tasks.save(task);
    }

    private static TaskSchedule futureSchedule() {
        Instant openAt = Instant.now().plus(1, ChronoUnit.HOURS);
        return new TaskSchedule(openAt, openAt.plus(1, ChronoUnit.HOURS));
    }

    private int opinionMapFinalizationRequestCount(TaskId taskId) {
        return jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM integration_outbox
                WHERE aggregate_id = ?
                  AND event_type = ?
                """, Integer.class,
                taskId.value(),
                TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE);
    }

    private int expectedSubmissionCount(TaskId taskId) {
        return jdbcTemplate.queryForObject("""
                SELECT (payload::jsonb ->> 'expectedSubmissionCount')::integer
                FROM integration_outbox
                WHERE aggregate_id = ?
                  AND event_type = ?
                """, Integer.class,
                taskId.value(),
                TaskOpinionMapFinalizationRequestedV1.EVENT_TYPE);
    }

    private static TaskQuestion choiceQuestion() {
        return choiceQuestion("하나를 선택해주세요.");
    }

    private static TaskQuestion choiceQuestion(String content) {
        return new TaskQuestion(
                new TaskQuestionId(UUID.randomUUID()),
                1,
                TaskQuestionType.SINGLE_CHOICE,
                content,
                null,
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(
                                new TaskOptionId(UUID.randomUUID()), 1, "A"),
                        TaskOption.standard(
                                new TaskOptionId(UUID.randomUUID()), 2, "B")));
    }
}
