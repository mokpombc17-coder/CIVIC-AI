package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.domain.common.TaskActorId;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskLifecycleHistoryId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaGenerationId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaVersionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
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
        TaskSubmission laterWithHigherId = submission(
                task, 30, 2, OPTION_TWO_ID,
                "세 번째 응답", Instant.parse("2026-08-24T00:10:00Z"));
        TaskSubmission earlier = submission(
                task, 20, 3, OPTION_TWO_ID,
                "첫 번째 응답", Instant.parse("2026-08-24T00:05:00Z"));
        TaskSubmission laterWithLowerId = submission(
                task, 10, 1, OPTION_ONE_ID,
                "두 번째 응답", Instant.parse("2026-08-24T00:10:00Z"));

        TaskResultViewV1 result = assembler.assemble(
                task,
                List.of(laterWithHigherId, earlier, laterWithLowerId),
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
                        TaskResultViewV1.ResponseData::sequence,
                        TaskResultViewV1.ResponseData::selectedOptionDisplayOrder,
                        TaskResultViewV1.ResponseData::reason)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                1, 2, "첫 번째 응답"),
                        org.assertj.core.groups.Tuple.tuple(
                                2, 1, "두 번째 응답"),
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
        TaskSubmission foreign = submission(
                foreignTask, 10, 1, OPTION_ONE_ID,
                "다른 과업 응답", CREATED_AT.plusSeconds(30));
        assertThatThrownBy(() -> assembler.assemble(
                task, List.of(foreign), 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("all submissions must belong to task");

        TaskSubmission submission = submission(
                task, 11, 1, OPTION_ONE_ID,
                "중복 응답", CREATED_AT.plusSeconds(30));
        assertThatThrownBy(() -> assembler.assemble(
                task, List.of(submission, submission), 1))
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

    private TaskSubmission submission(
            Task task,
            long submissionId,
            long userId,
            TaskOptionId optionId,
            String reason,
            Instant submittedAt
    ) {
        return TaskSubmission.restore(
                new TaskSubmissionId(uuid(submissionId)),
                new TaskUserId("user-" + userId),
                task,
                null,
                new TaskPersonaGenerationId(uuid(400 + userId)),
                new TaskPersonaVersionId(uuid(500 + userId)),
                QUESTION_ID,
                optionId,
                TaskReasonSource.USER_WRITTEN,
                null,
                reason,
                submittedAt);
    }

    private static UUID uuid(long value) {
        return new UUID(0, value);
    }
}
