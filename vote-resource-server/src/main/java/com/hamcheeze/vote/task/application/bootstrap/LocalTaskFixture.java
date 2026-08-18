package com.hamcheeze.vote.task.application.bootstrap;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.task.LongTextConstraint;
import com.hamcheeze.vote.task.domain.task.MultipleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.NumberConstraint;
import com.hamcheeze.vote.task.domain.task.ScaleConstraint;
import com.hamcheeze.vote.task.domain.task.ShortTextConstraint;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleEventType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleTrigger;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;

import java.math.BigDecimal;
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
    public static final TaskActorId ACTOR = new TaskActorId(
            "local-task-bootstrap");
    public static final Instant CREATED_AT = Instant.parse(
            "2026-08-18T00:00:00Z");
    public static final Instant CLOSE_AT = Instant.parse(
            "2099-12-31T23:59:59Z");
    public static final String TITLE = "우리 동네 생활 개선 과업";
    public static final String DESCRIPTION =
            "6개 질문 유형과 AI 예상 답변 흐름을 확인하기 위한 local 전용 과업입니다.";
    public static final String OPEN_REASON = "local bootstrap fixture";

    private LocalTaskFixture() {
    }

    public static Task draft() {
        return Task.draft(
                TASK_ID, TITLE, DESCRIPTION, questions(), CREATED_AT);
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
                                standardOption(1, 3, 3, "문화·여가"),
                                otherOption(1, 4, 4))),
                new TaskQuestion(
                        questionId(2), 2, TaskQuestionType.MULTIPLE_CHOICE,
                        "평소 자주 이용하는 동네 시설을 선택해 주세요.",
                        "최소 1개, 최대 3개까지 선택할 수 있습니다.",
                        new MultipleChoiceConstraint(1, 3),
                        List.of(
                                standardOption(2, 1, 1, "공원"),
                                standardOption(2, 2, 2, "도서관"),
                                standardOption(2, 3, 3, "체육 시설"),
                                standardOption(2, 4, 4, "복지 시설"),
                                otherOption(2, 5, 5))),
                new TaskQuestion(
                        questionId(3), 3, TaskQuestionType.SHORT_TEXT,
                        "우리 동네를 한 단어로 표현한다면 무엇인가요?",
                        "100자 이내로 입력해 주세요.",
                        new ShortTextConstraint(100),
                        List.of()),
                new TaskQuestion(
                        questionId(4), 4, TaskQuestionType.LONG_TEXT,
                        "동네 생활에서 개선되었으면 하는 점을 자유롭게 적어 주세요.",
                        "구체적인 경험을 포함해도 좋습니다.",
                        new LongTextConstraint(1_000),
                        List.of()),
                new TaskQuestion(
                        questionId(5), 5, TaskQuestionType.NUMBER,
                        "현재 동네 생활 만족도를 0점부터 100점 사이로 입력해 주세요.",
                        "소수점 입력도 가능합니다.",
                        new NumberConstraint(
                                BigDecimal.ZERO,
                                new BigDecimal("100"),
                                true),
                        List.of()),
                new TaskQuestion(
                        questionId(6), 6, TaskQuestionType.SCALE,
                        "동네 생활을 다른 사람에게 추천하고 싶은 정도는 어떤가요?",
                        "1점부터 5점까지 선택해 주세요.",
                        new ScaleConstraint(1, 5, "전혀 추천하지 않음", "매우 추천함"),
                        List.of()));
    }

    public static boolean matches(Task task) {
        return task.id().equals(TASK_ID)
                && task.title().equals(TITLE)
                && DESCRIPTION.equals(task.description())
                && matchesQuestions(task.questions())
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

    private static boolean matchesQuestions(List<TaskQuestion> actual) {
        List<TaskQuestion> expected = questions();
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
        if (actual.constraint() instanceof NumberConstraint actualNumber
                && expected.constraint()
                instanceof NumberConstraint expectedNumber) {
            return sameNumber(
                    actualNumber.minimumValue(),
                    expectedNumber.minimumValue())
                    && sameNumber(
                    actualNumber.maximumValue(),
                    expectedNumber.maximumValue())
                    && actualNumber.decimalAllowed()
                    == expectedNumber.decimalAllowed();
        }
        return actual.constraint().equals(expected.constraint());
    }

    private static boolean sameNumber(
            BigDecimal actual,
            BigDecimal expected
    ) {
        return actual == null || expected == null
                ? actual == expected
                : actual.compareTo(expected) == 0;
    }

    public static boolean matches(TaskLifecycleHistory history) {
        return history.id().equals(HISTORY_ID)
                && history.taskId().equals(TASK_ID)
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

    private static TaskOption otherOption(
            int question,
            int option,
            int displayOrder
    ) {
        return TaskOption.other(
                optionId(question, option), displayOrder);
    }

    private static TaskOptionId optionId(int question, int option) {
        return new TaskOptionId(UUID.fromString(String.format(
                "1302%04d-0000-0000-0000-%012d", question, option)));
    }

    private static TaskId taskId(String value) {
        return new TaskId(UUID.fromString(value));
    }
}
