package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.result.TaskResultManifest;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TaskResultForLlmV1AssemblerTest {

    private static final TaskId TASK_ID = new TaskId(new UUID(0, 1));
    private static final Instant CLOSED_AT =
            Instant.parse("2026-08-24T01:00:00Z");
    private static final String SOURCE_HASH = "a".repeat(64);

    private final TaskResultForLlmV1Assembler assembler =
            new TaskResultForLlmV1Assembler();

    @Test
    void projectsOnlyAnonymousFinalChoiceAndReasonData() {
        TaskResultForLlmV1 export = assembler.assemble(
                TASK_ID, verifiedResult());

        assertThat(export.taskId()).isEqualTo(TASK_ID);
        assertThat(export.sourceBodySha256()).isEqualTo(SOURCE_HASH);
        assertThat(export.options())
                .extracting(TaskResultForLlmV1.OptionData::key)
                .containsExactly("O1", "O2");
        assertThat(export.responses()).containsExactly(
                new TaskResultForLlmV1.ResponseData(
                        "R1", "O2", "직접 작성한 이유"),
                new TaskResultForLlmV1.ResponseData(
                        "R2", "O1", "채택한 예상 이유"));
    }

    private static VerifiedTaskResultView verifiedResult() {
        TaskResultViewV1 view = new TaskResultViewV1(
                1,
                CLOSED_AT,
                TaskClosureType.DEADLINE_REACHED,
                new TaskData("정책 선택", "정책 배경"),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 정책을 선택하시겠습니까?",
                        null),
                List.of(
                        new OptionData(1, "첫 번째 정책"),
                        new OptionData(2, "두 번째 정책")),
                List.of(
                        new ResponseData(
                                1, 2, "직접 작성한 이유",
                                TaskReasonSource.USER_WRITTEN),
                        new ResponseData(
                                2, 1, "채택한 예상 이유",
                                TaskReasonSource.AI_ACCEPTED)));
        TaskResultManifest manifest = new TaskResultManifest(
                TASK_ID,
                1,
                TaskResultViewV1.SCHEMA_VERSION,
                CLOSED_AT,
                2,
                SOURCE_HASH,
                CLOSED_AT);
        return new VerifiedTaskResultView(
                manifest,
                view,
                new RenderedTaskResultView("verified", SOURCE_HASH));
    }
}
