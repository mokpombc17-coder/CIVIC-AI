package com.hamcheeze.vote.task.application.bootstrap;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.submission.WriteTaskReason;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskLifecycleHistory;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.hamcheeze.vote.task.domain.task.TaskStatus;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.IntStream;

/** Local-only participated and finalized Task used by completed/result pages. */
public final class LocalCompletedTaskFixture {

    public static final TaskId TASK_ID = new TaskId(UUID.fromString(
            "13000000-0000-0000-0000-000000000005"));
    public static final TaskLifecycleHistoryId OPEN_HISTORY_ID =
            new TaskLifecycleHistoryId(UUID.fromString(
                    "13000000-0000-0000-0000-000000000006"));
    public static final TaskActorId ACTOR = new TaskActorId(
            "local-completed-task-bootstrap");
    public static final Instant CREATED_AT = Instant.parse(
            "2026-08-18T00:00:00Z");
    public static final Instant CLOSE_AT = Instant.parse(
            "2099-12-31T23:59:59Z");
    public static final String TITLE = "우리 동네 공원 개선 결과 과업";
    public static final String DESCRIPTION =
            "완료 목록과 참여자 전용 결과 화면을 확인하기 위한 local 전용 투표입니다.";
    public static final String OPEN_REASON =
            "local completed Task bootstrap fixture";
    public static final String CLOSE_REASON =
            "local completed Task result fixture";
    public static final String SUBMISSION_IDEMPOTENCY_KEY =
            UUID.nameUUIDFromBytes(
                    "vote-local-completed-task-v1".getBytes(
                            StandardCharsets.UTF_8)).toString();
    public static final String SUBMISSION_REASON =
            "아이들이 안전하게 이용할 수 있는 놀이 공간을 먼저 개선하면 좋겠습니다.";

    private static final TaskQuestionId QUESTION_ID =
            new TaskQuestionId(UUID.fromString(
                    "13010000-0000-0000-0000-000000000003"));
    private static final TaskOptionId SELECTED_OPTION_ID =
            optionId(1);

    private LocalCompletedTaskFixture() {
    }

    public static Task draft() {
        return Task.draft(
                TASK_ID, TITLE, DESCRIPTION, questions(), CREATED_AT);
    }

    public static TaskLifecycleHistory open(Task task) {
        Objects.requireNonNull(task, "task");
        if (!TASK_ID.equals(task.id())) {
            throw new IllegalArgumentException(
                    "local completed fixture requires its fixed Task");
        }
        return task.openImmediately(
                OPEN_HISTORY_ID, CLOSE_AT, ACTOR, OPEN_REASON, CREATED_AT);
    }

    public static WriteTaskReason answer(Task task) {
        Objects.requireNonNull(task, "task");
        if (!TASK_ID.equals(task.id()) || !matchesQuestions(task.questions())) {
            throw new IllegalArgumentException(
                    "local completed fixture Task content does not match");
        }
        var question = task.questions().getFirst();
        return new WriteTaskReason(
                question.id(), question.options().getFirst().id(),
                SUBMISSION_REASON);
    }

    public static boolean matchesClosed(Task task) {
        return matchesContent(task)
                && task.status() == TaskStatus.CLOSED
                && task.schedule() != null
                && CREATED_AT.equals(task.schedule().scheduledOpenAt())
                && CLOSE_AT.equals(task.schedule().scheduledCloseAt())
                && CREATED_AT.equals(task.publishedAt())
                && CREATED_AT.equals(task.openedAt())
                && task.closedAt() != null
                && task.closureType() == TaskClosureType.EARLY_CLOSED
                && task.resultEligible();
    }

    private static boolean matchesContent(Task task) {
        return TASK_ID.equals(task.id())
                && TITLE.equals(task.title())
                && DESCRIPTION.equals(task.description())
                && matchesQuestions(task.questions());
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
                && Objects.equals(
                        actual.description(), expected.description())
                && actual.constraint().equals(expected.constraint())
                && actual.options().equals(expected.options());
    }

    private static List<TaskQuestion> questions() {
        return List.of(new TaskQuestion(
                QUESTION_ID,
                1,
                TaskQuestionType.SINGLE_CHOICE,
                "우리 동네 공원에서 가장 먼저 개선할 시설은 무엇인가요?",
                "하나만 선택해 주세요.",
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(
                                SELECTED_OPTION_ID, 1, "어린이 놀이 공간"),
                        TaskOption.standard(optionId(2), 2, "산책로와 조명"),
                        TaskOption.standard(optionId(3), 3, "휴식 공간"))));
    }

    private static TaskOptionId optionId(int option) {
        return new TaskOptionId(UUID.fromString(String.format(
                "13020003-0000-0000-0000-%012d", option)));
    }
}
