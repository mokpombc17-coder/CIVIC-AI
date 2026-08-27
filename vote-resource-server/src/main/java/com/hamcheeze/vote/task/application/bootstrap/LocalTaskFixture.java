package com.hamcheeze.vote.task.application.bootstrap;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleEventType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleTrigger;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

public final class LocalTaskFixture {

    public static final TaskId TASK_ID = taskId(
            "13000000-0000-0000-0000-000000000001");
    public static final TaskLifecycleHistoryId HISTORY_ID =
            new TaskLifecycleHistoryId(UUID.fromString(
                    "13000000-0000-0000-0000-000000000002"));
    public static final TaskId SECOND_TASK_ID = taskId(
            "13000000-0000-0000-0000-000000000003");
    public static final TaskLifecycleHistoryId SECOND_HISTORY_ID =
            new TaskLifecycleHistoryId(UUID.fromString(
                    "13000000-0000-0000-0000-000000000004"));
    public static final TaskActorId ACTOR = new TaskActorId(
            "local-task-bootstrap");
    public static final Instant CREATED_AT = Instant.parse(
            "2026-08-18T00:00:00Z");
    public static final Instant CLOSE_AT = Instant.parse(
            "2099-12-31T23:59:59Z");
    public static final String TITLE = "우리 동네 생활 개선 과업";
    public static final String DESCRIPTION =
            "단일 선택과 선택지별 AI 예상 이유 흐름을 확인하기 위한 local 전용 투표입니다.";
    public static final String SECOND_TITLE = "우리 동네 예산 우선순위 과업";
    public static final String SECOND_DESCRIPTION =
            "지역 예산의 우선 사용처에 대한 의견을 확인하기 위한 local 전용 투표입니다.";
    public static final String OPEN_REASON = "local bootstrap fixture";

    private LocalTaskFixture() {
    }

    public static Task draft() {
        return Task.draft(
                TASK_ID, TITLE, DESCRIPTION, questions(), CREATED_AT);
    }

    public static Task secondDraft() {
        return Task.draft(
                SECOND_TASK_ID, SECOND_TITLE, SECOND_DESCRIPTION,
                secondQuestions(), CREATED_AT);
    }

    static List<Task> drafts() {
        return List.of(draft(), secondDraft());
    }

    static TaskLifecycleHistory open(Task task) {
        return task.openImmediately(
                historyId(task.id()), CLOSE_AT, ACTOR, OPEN_REASON, CREATED_AT);
    }

    public static List<TaskQuestion> questions() {
        return List.of(
                new TaskQuestion(
                        questionId(1), 1, TaskQuestionType.SINGLE_CHOICE,
                        "우리 동네에서 가장 먼저 개선되었으면 하는 분야는 무엇인가요?",
                        "하나만 선택해 주세요.",
                                new SingleChoiceConstraint(),
                        List.of(
                                standardOption(1, 1, 1, "교통"),
                                standardOption(1, 2, 2, "주거 환경"),
                                standardOption(1, 3, 3, "문화·여가"))));
    }

    public static List<TaskQuestion> secondQuestions() {
        return List.of(
                new TaskQuestion(
                        questionId(2), 1, TaskQuestionType.SINGLE_CHOICE,
                        "우리 동네 예산을 가장 먼저 사용해야 할 분야는 무엇인가요?",
                        "하나만 선택해 주세요.",
                        new SingleChoiceConstraint(),
                        List.of(
                                standardOption(2, 1, 1, "돌봄·복지"),
                                standardOption(2, 2, 2, "안전·방재"),
                                standardOption(2, 3, 3, "교육·청소년"))));
    }

    public static boolean matches(Task task) {
        if (task.id().equals(TASK_ID)) {
            return matchesTask(task, TITLE, DESCRIPTION, questions());
        }
        if (task.id().equals(SECOND_TASK_ID)) {
            return matchesTask(
                    task, SECOND_TITLE, SECOND_DESCRIPTION, secondQuestions());
        }
        return false;
    }

    private static boolean matchesTask(
            Task task,
            String title,
            String description,
            List<TaskQuestion> questions
    ) {
        return task.title().equals(title)
                && description.equals(task.description())
                && matchesQuestions(task.questions(), questions)
                && task.status() == TaskStatus.OPEN
                && task.schedule() != null
                && task.schedule().scheduledOpenAt().equals(CREATED_AT)
                && task.schedule().scheduledCloseAt().equals(CLOSE_AT)
                && CREATED_AT.equals(task.publishedAt())
                && CREATED_AT.equals(task.openedAt())
                && task.closedAt() == null
                && task.closureType() == null
                && CREATED_AT.equals(task.createdAt())
                && CREATED_AT.equals(task.updatedAt());
    }

    private static boolean matchesQuestions(
            List<TaskQuestion> actual,
            List<TaskQuestion> expected
    ) {
        return actual.size() == expected.size()
                && IntStream.range(0, expected.size())
                .allMatch(index -> matchesQuestion(
                        actual.get(index), expected.get(index)));
    }

    private static boolean matchesQuestion(
            TaskQuestion actual,
            TaskQuestion expected
    ) {
        return actual.id().equals(expected.id())
                && actual.displayOrder() == expected.displayOrder()
                && actual.type() == expected.type()
                && actual.content().equals(expected.content())
                && java.util.Objects.equals(
                        actual.description(), expected.description())
                && matchesConstraint(actual, expected)
                && actual.options().equals(expected.options());
    }

    private static boolean matchesConstraint(
            TaskQuestion actual,
            TaskQuestion expected
    ) {
        return actual.constraint().equals(expected.constraint());
    }

    public static boolean matches(TaskLifecycleHistory history) {
        TaskLifecycleHistoryId expectedHistoryId;
        if (history.taskId().equals(TASK_ID)) {
            expectedHistoryId = HISTORY_ID;
        } else if (history.taskId().equals(SECOND_TASK_ID)) {
            expectedHistoryId = SECOND_HISTORY_ID;
        } else {
            return false;
        }
        return history.id().equals(expectedHistoryId)
                && history.eventType() == TaskLifecycleEventType.OPENED
                && history.previousStatus() == TaskStatus.DRAFT
                && history.newStatus() == TaskStatus.OPEN
                && history.previousSchedule() == null
                && history.newSchedule() != null
                && history.newSchedule().scheduledOpenAt().equals(CREATED_AT)
                && history.newSchedule().scheduledCloseAt().equals(CLOSE_AT)
                && history.trigger() == TaskLifecycleTrigger.ADMIN
                && ACTOR.equals(history.actorId())
                && OPEN_REASON.equals(history.reason())
                && history.closureType() == null
                && CREATED_AT.equals(history.occurredAt());
    }

    private static TaskLifecycleHistoryId historyId(TaskId taskId) {
        if (taskId.equals(TASK_ID)) {
            return HISTORY_ID;
        }
        if (taskId.equals(SECOND_TASK_ID)) {
            return SECOND_HISTORY_ID;
        }
        throw new IllegalArgumentException("unknown local Task fixture");
    }

    private static TaskQuestionId questionId(int number) {
        return new TaskQuestionId(UUID.fromString(String.format(
                "13010000-0000-0000-0000-%012d", number)));
    }

    private static TaskOption standardOption(
            int question,
            int option,
            int displayOrder,
            String content
    ) {
        return TaskOption.standard(
                optionId(question, option), displayOrder, content);
    }

    private static TaskOptionId optionId(int question, int option) {
        return new TaskOptionId(UUID.fromString(String.format(
                "1302%04d-0000-0000-0000-%012d", question, option)));
    }

    private static TaskId taskId(String value) {
        return new TaskId(UUID.fromString(value));
    }
}
