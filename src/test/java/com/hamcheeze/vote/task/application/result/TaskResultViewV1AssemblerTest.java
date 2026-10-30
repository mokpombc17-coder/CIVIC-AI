package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskResultViewV1AssemblerTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-24T00:00:00Z");
    private static final Instant CLOSED_AT =
            Instant.parse("2026-08-24T00:20:00Z");
    private static final TaskQuestionId QUESTION_ID =
            new TaskQuestionId(uuid(100));
    private static final TaskOptionId OPTION_ONE_ID =
            new TaskOptionId(uuid(201));
    private static final TaskOptionId OPTION_TWO_ID =
            new TaskOptionId(uuid(202));

    private final TaskResultViewV1Assembler assembler =
            new TaskResultViewV1Assembler();

    @Test
    void mapsFinalizedTaskAndOrdersResponsesDeterministically() {
        Task task = closedTask(new TaskId(uuid(1)));
        TaskResultResponse higherId = response(
                task, 30, OPTION_TWO_ID, "세 번째 응답");
        TaskResultResponse middleId = response(
                task, 20, OPTION_TWO_ID, "두 번째 응답");
        TaskResultResponse lowerId = response(
                task, 10, OPTION_ONE_ID, "첫 번째 응답");

        TaskResultViewV1 result = assembler.assemble(
                task,
                List.of(higherId, middleId, lowerId),
                1);

        assertThat(result.resultVersion()).isEqualTo(1);
        assertThat(result.closedAt()).isEqualTo(CLOSED_AT);
        assertThat(result.task().title()).isEqualTo("결과 과업");
        assertThat(result.question().content()).isEqualTo("선호 선택지");
        assertThat(result.options())
                .extracting(
                        TaskResultViewV1.OptionData::displayOrder,
                        TaskResultViewV1.OptionData::content)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "첫 번째"),
                        org.assertj.core.groups.Tuple.tuple(2, "두 번째"));
        assertThat(result.responses())
                .extracting(
                        TaskResultViewV1.ResponseData::participantSequence,
                        TaskResultViewV1.ResponseData::selectedOptionDisplayOrder,
                        TaskResultViewV1.ResponseData::reason)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                1, 1, "첫 번째 응답"),
                        org.assertj.core.groups.Tuple.tuple(
                                2, 2, "두 번째 응답"),
                        org.assertj.core.groups.Tuple.tuple(
                                3, 2, "세 번째 응답"));
    }

    @Test
    void rejectsNonFinalizedTaskAndForeignOrDuplicateSubmissions() {
        Task openTask = openTask(new TaskId(uuid(1)));
        assertThatThrownBy(() -> assembler.assemble(
                openTask, List.of(), 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("task must have a finalized result");

        Task task = closedTask(new TaskId(uuid(1)));
        Task foreignTask = closedTask(new TaskId(uuid(2)));
        TaskResultResponse foreign = response(
                foreignTask, 10, OPTION_ONE_ID,
                "다른 과업 응답");
        assertThatThrownBy(() -> assembler.assemble(
                task, List.of(foreign), 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("all submissions must belong to task");

        TaskResultResponse response = response(
                task, 11, OPTION_ONE_ID,
                "중복 응답");
        assertThatThrownBy(() -> assembler.assemble(
                task, List.of(response, response), 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("task result contains duplicate submissionId");
    }

    private Task closedTask(TaskId taskId) {
        Task task = openTask(taskId);
        task.closeEarly(
                new TaskLifecycleHistoryId(uuid(302)),
                new TaskActorId("admin"),
                "결과 확정",
                CLOSED_AT);
        return task;
    }

    private Task openTask(TaskId taskId) {
        Task task = Task.draft(
                taskId,
                "결과 과업",
                "과업 설명",
                List.of(question()),
                CREATED_AT);
        task.openImmediately(
                new TaskLifecycleHistoryId(uuid(301)),
                CLOSED_AT.plusSeconds(3_600),
                new TaskActorId("admin"),
                "즉시 시작",
                CREATED_AT.plusSeconds(1));
        return task;
    }

    private TaskQuestion question() {
        return new TaskQuestion(
                QUESTION_ID,
                1,
                TaskQuestionType.SINGLE_CHOICE,
                "선호 선택지",
                null,
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(
                                OPTION_ONE_ID, 1, "첫 번째"),
                        TaskOption.standard(
                                OPTION_TWO_ID, 2, "두 번째")));
    }

    private TaskResultResponse response(
            Task task,
            long submissionId,
            TaskOptionId optionId,
            String reason
    ) {
        return new TaskResultResponse(
                new TaskSubmissionId(uuid(submissionId)),
                task.id(),
                QUESTION_ID,
                optionId,
                reason,
                TaskReasonSource.USER_WRITTEN);
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
