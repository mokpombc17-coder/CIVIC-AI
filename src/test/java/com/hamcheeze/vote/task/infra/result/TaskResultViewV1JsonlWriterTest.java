package com.hamcheeze.vote.task.infra.result;

import com.hamcheeze.vote.task.application.result.TaskResultViewV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.application.port.out.TaskResultViewRenderer.RenderedTaskResultView;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import com.hamcheeze.vote.task.domain.task.TaskClosureType;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TaskResultViewV1JsonlWriterTest {

    private final TaskResultViewV1JsonlWriter writer =
            new TaskResultViewV1JsonlWriter();

    @Test
    void rendersTheFrozenTaskResultViewV1Contract() throws IOException {
        RenderedTaskResultView rendered = writer.render(view());

        assertThat(rendered.content()).isEqualTo(goldenContract());
        assertThat(rendered.bodySha256()).isEqualTo(
                "fdace506cc9043d4be4a19cee7c5a3afec95be73e01539afd45c83f7b6875b5b");
        assertThat(rendered.content()).doesNotContain(
                "taskId",
                "questionId",
                "optionId",
                "submissionId",
                "participantId",
                "submittedAt",
                "personaGenerationId",
                "predictionId");
    }

    private TaskResultViewV1 view() {
        return new TaskResultViewV1(
                1,
                Instant.parse("2026-08-24T01:00:00Z"),
                TaskClosureType.EARLY_CLOSED,
                new TaskData(
                        "출근 정책 선호도",
                        "향후 출근 정책에 대한 의견 조사"),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 근무 형태를 선호하나요?",
                        null),
                List.of(
                        new OptionData(1, "전면 출근"),
                        new OptionData(2, "하이브리드"),
                        new OptionData(3, "전면 재택")),
                List.of(
                        new ResponseData(
                                1,
                                2,
                                "협업과 집중 근무를 병행할 수 있어서",
                                TaskReasonSource.USER_WRITTEN),
                        new ResponseData(
                                2,
                                3,
                                "출퇴근 시간이 너무 길어서",
                                TaskReasonSource.AI_ACCEPTED)));
    }

    private String goldenContract() throws IOException {
        try (InputStream input = getClass().getResourceAsStream(
                "/contracts/task-result-view-v1.jsonl")) {
            if (input == null) {
                throw new IllegalStateException(
                        "task-result-view-v1 golden contract is missing");
            }
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
