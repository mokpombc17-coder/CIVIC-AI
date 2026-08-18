package com.hamcheeze.vote.task.domain.task;

import com.hamcheeze.vote.task.domain.common.TaskDomainException;
import com.hamcheeze.vote.task.domain.common.TaskValidationException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static com.hamcheeze.vote.task.TaskTestFixtures.NOW;
import static com.hamcheeze.vote.task.TaskTestFixtures.actorId;
import static com.hamcheeze.vote.task.TaskTestFixtures.draftTask;
import static com.hamcheeze.vote.task.TaskTestFixtures.historyId;
import static com.hamcheeze.vote.task.TaskTestFixtures.singleQuestion;
import static com.hamcheeze.vote.task.TaskTestFixtures.taskId;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskTest {

    @Test
    void draftContentCanChangeButPublishedContentCannot() {
        Task task = draftTask();
        List<TaskQuestion> replacement = new ArrayList<>();
        replacement.add(singleQuestion());
        task.replaceContent(
                "  변경된 과업  ", null, replacement,
                NOW.plusSeconds(1));
        replacement.clear();

        assertThat(task.title()).isEqualTo("변경된 과업");
        assertThat(task.questions()).hasSize(1);
        assertThatThrownBy(() -> task.questions().clear())
                .isInstanceOf(UnsupportedOperationException.class);

        task.schedule(
                historyId(1),
                new TaskSchedule(
                        NOW.plusSeconds(100), NOW.plusSeconds(1_000)),
                actorId(), null, NOW.plusSeconds(10));

        assertThatThrownBy(() -> task.replaceContent(
                "다시 변경", null, List.of(singleQuestion()),
                NOW.plusSeconds(20)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo("TASK_TRANSITION_NOT_ALLOWED"));
    }

    @Test
    void scheduleOpenDeadlineChangeAndCloseKeepHistory() {
        Task task = draftTask();
        TaskSchedule first = new TaskSchedule(
                NOW.plusSeconds(100), NOW.plusSeconds(1_000));
        TaskLifecycleHistory scheduled = task.schedule(
                historyId(1), first, actorId(), "예약", NOW.plusSeconds(10));
        TaskSchedule changed = new TaskSchedule(
                NOW.plusSeconds(200), NOW.plusSeconds(1_100));
        TaskLifecycleHistory rescheduled = task.reschedule(
                historyId(2), changed, actorId(), null, NOW.plusSeconds(20));
        TaskLifecycleHistory opened = task.openScheduled(
                historyId(3), TaskLifecycleTrigger.SYSTEM,
                null, null, NOW.plusSeconds(200));
        Instant changedDeadline = NOW.plusSeconds(900);
        TaskLifecycleHistory deadlineChanged = task.changeDeadline(
                historyId(4), changedDeadline, actorId(),
                "마감 단축", NOW.plusSeconds(300));
        TaskLifecycleHistory closed = task.closeAtDeadline(
                historyId(5), changedDeadline);

        assertThat(scheduled.previousStatus()).isEqualTo(TaskStatus.DRAFT);
        assertThat(rescheduled.previousSchedule()).isEqualTo(first);
        assertThat(opened.newStatus()).isEqualTo(TaskStatus.OPEN);
        assertThat(deadlineChanged.newSchedule().scheduledCloseAt())
                .isEqualTo(changedDeadline);
        assertThat(closed.closureType())
                .isEqualTo(TaskClosureType.DEADLINE_REACHED);
        assertThat(task.status()).isEqualTo(TaskStatus.CLOSED);
        assertThat(task.resultEligible()).isTrue();
    }

    @Test
    void supportsEarlyCloseCancellationAndMissedSchedule() {
        Task early = draftTask();
        early.openImmediately(
                historyId(1), NOW.plusSeconds(1_000), actorId(),
                null, NOW.plusSeconds(10));
        early.closeEarly(
                historyId(2), actorId(), null, NOW.plusSeconds(20));
        assertThat(early.closureType())
                .isEqualTo(TaskClosureType.EARLY_CLOSED);
        assertThat(early.resultEligible()).isTrue();

        Task cancelled = draftTask();
        cancelled.cancel(
                historyId(3), actorId(), "취소", NOW.plusSeconds(10));
        assertThat(cancelled.closureType())
                .isEqualTo(TaskClosureType.CANCELLED);
        assertThat(cancelled.resultEligible()).isFalse();

        Task missed = draftTask();
        missed.schedule(
                historyId(4),
                new TaskSchedule(
                        NOW.plusSeconds(100), NOW.plusSeconds(200)),
                actorId(), null, NOW.plusSeconds(10));
        missed.missSchedule(historyId(5), NOW.plusSeconds(200));
        assertThat(missed.closureType())
                .isEqualTo(TaskClosureType.MISSED_SCHEDULE);
        assertThat(missed.resultEligible()).isFalse();
    }

    @Test
    void restoreRejectsInconsistentCancelledShape() {
        assertThatThrownBy(() -> Task.restore(
                taskId(), "과업", null, List.of(singleQuestion()),
                TaskStatus.CLOSED, null,
                NOW.plusSeconds(1), null, NOW.plusSeconds(2),
                TaskClosureType.CANCELLED, NOW, NOW.plusSeconds(2)))
                .isInstanceOfSatisfying(
                        TaskDomainException.class,
                        exception -> assertThat(exception.violation().code())
                                .isEqualTo("TASK_STATE_INCONSISTENT"));
    }

    @Test
    void draftAllowsZeroToFiftyQuestionsButPublicationRequiresOne() {
        Task empty = Task.draft(
                taskId(), "빈 초안", null, List.of(), NOW);
        assertThat(empty.questions()).isEmpty();
        assertThatThrownBy(() -> empty.schedule(
                historyId(1),
                new TaskSchedule(
                        NOW.plusSeconds(100), NOW.plusSeconds(200)),
                actorId(), null, NOW.plusSeconds(10)))
                .isInstanceOf(TaskValidationException.class);

        List<TaskQuestion> fifty = new ArrayList<>();
        for (int order = 1; order <= 50; order++) {
            fifty.add(new TaskQuestion(
                    new com.hamcheeze.vote.task.domain.common.TaskQuestionId(
                            new java.util.UUID(40, order)),
                    order,
                    TaskQuestionType.SHORT_TEXT,
                    "질문 " + order,
                    null,
                    ShortTextConstraint.defaults(),
                    List.of()));
        }
        Task maximum = Task.draft(
                taskId(), "최대 문항", null, fifty, NOW);
        assertThat(maximum.questions()).hasSize(50);

        fifty.add(new TaskQuestion(
                new com.hamcheeze.vote.task.domain.common.TaskQuestionId(
                        new java.util.UUID(40, 51)),
                51, TaskQuestionType.SHORT_TEXT, "질문 51", null,
                ShortTextConstraint.defaults(), List.of()));
        assertThatThrownBy(() -> Task.draft(
                taskId(), "초과", null, fifty, NOW))
                .isInstanceOf(TaskDomainException.class);
    }

    @Test
    void rejectsDuplicateQuestionIdentityAndNonContinuousPublicationOrder() {
        TaskQuestion first = singleQuestion();
        TaskQuestion duplicateId = new TaskQuestion(
                first.id(), 2, first.type(), "다른 내용", null,
                first.constraint(), first.options());
        assertThatThrownBy(() -> Task.draft(
                taskId(), "중복", null,
                List.of(first, duplicateId), NOW))
                .isInstanceOf(TaskDomainException.class);

        TaskQuestion startsAtTwo = new TaskQuestion(
                new com.hamcheeze.vote.task.domain.common.TaskQuestionId(
                        new java.util.UUID(41, 1)),
                2, TaskQuestionType.SHORT_TEXT, "질문", null,
                ShortTextConstraint.defaults(), List.of());
        Task nonContinuous = Task.draft(
                taskId(), "비연속", null, List.of(startsAtTwo), NOW);
        assertThatThrownBy(() -> nonContinuous.openImmediately(
                historyId(1), NOW.plusSeconds(200), actorId(),
                null, NOW.plusSeconds(10)))
                .isInstanceOf(TaskValidationException.class);
    }

    @Test
    void scheduledTaskCanOpenEarlyAndClosedTaskNeverReopens() {
        Task task = draftTask();
        task.schedule(
                historyId(1),
                new TaskSchedule(
                        NOW.plusSeconds(100), NOW.plusSeconds(500)),
                actorId(), null, NOW.plusSeconds(10));
        task.openScheduled(
                historyId(2), TaskLifecycleTrigger.ADMIN,
                actorId(), "조기 공개", NOW.plusSeconds(50));
        assertThat(task.isOpenAt(NOW.plusSeconds(50))).isTrue();
        assertThat(task.schedule().scheduledOpenAt())
                .isEqualTo(NOW.plusSeconds(50));
        task.changeDeadline(
                historyId(3), NOW.plusSeconds(700), actorId(),
                null, NOW.plusSeconds(60));
        assertThat(task.schedule().scheduledCloseAt())
                .isEqualTo(NOW.plusSeconds(700));
        task.cancel(
                historyId(4), actorId(), null, NOW.plusSeconds(70));

        assertThatThrownBy(() -> task.openScheduled(
                historyId(5), TaskLifecycleTrigger.ADMIN,
                actorId(), null, NOW.plusSeconds(80)))
                .isInstanceOf(TaskDomainException.class);
    }
}
