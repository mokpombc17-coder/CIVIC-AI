package com.hamcheeze.vote.task.infra.result;

import com.hamcheeze.vote.task.application.port.out.TaskResultForLlmRenderer.RenderedTaskResultForLlm;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TaskResultForLlmV1JsonlWriterTest {

    private static final String SOURCE_HASH = "a".repeat(64);
    private static final String BODY_HASH =
            "d9603d77e3bcb727467cb5f83dfb4cdd66b38467a8a472336175f160ae17681c";

    private final TaskResultForLlmV1JsonlWriter writer =
            new TaskResultForLlmV1JsonlWriter();

    @Test
    void rendersTheFrozenAnonymousLlmExportContract() throws IOException {
        RenderedTaskResultForLlm rendered = writer.render(export());

        assertThat(rendered.content()).isEqualTo(goldenContract());
        assertThat(rendered.bodySha256()).isEqualTo(BODY_HASH);
        assertThat(rendered.content()).doesNotContain(
                "reasonSource",
                "userId",
                "personaId",
                "submissionId",
                "predictionId",
                "submittedAt");
    }

    private static TaskResultForLlmV1 export() {
        return new TaskResultForLlmV1(
                new TaskId(new UUID(0, 1)),
                "task-result-view/v1",
                1,
                SOURCE_HASH,
                new TaskData(
                        "출근 정책 선호도",
                        "향후 출근 정책에 대한 의견 조사"),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 근무 형태를 선호하나요?",
                        null),
                List.of(
                        new OptionData("O1", 1, "전면 출근"),
                        new OptionData("O2", 2, "하이브리드"),
                        new OptionData("O3", 3, "전면 재택")),
                List.of(
                        new ResponseData(
                                "R1", "O2",
                                "협업과 집중 근무를 병행할 수 있어서"),
                        new ResponseData(
                                "R2", "O3",
                                "출퇴근 시간이 너무 길어서")));
    }

    private String goldenContract() throws IOException {
        try (InputStream input = getClass().getResourceAsStream(
                "/contracts/task-result-for-llm-v1.jsonl")) {
            if (input == null) {
                throw new IllegalStateException(
                        "task-result-for-llm/v1 golden contract is missing");
            }
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
