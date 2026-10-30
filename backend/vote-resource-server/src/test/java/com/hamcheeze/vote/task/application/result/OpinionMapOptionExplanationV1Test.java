package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.AreaSummary;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.GenerationStatus;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1.OptionSummary;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpinionMapOptionExplanationV1Test {

    private static final UUID TASK_UUID = new UUID(0, 1);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void deserializesGoldenContractAndMatchesLlmInput() throws Exception {
        OpinionMapOptionExplanationV1 output;
        try (InputStream inputStream = requiredResource(
                "contracts/opinionmap-option-explanation-v1.json")) {
            output = OBJECT_MAPPER.readValue(
                    inputStream, OpinionMapOptionExplanationV1.class);
        }

        assertThat(output.schemaVersion()).isEqualTo(
                OpinionMapOptionExplanationV1.SCHEMA_VERSION);
        assertThat(output.status()).isEqualTo(GenerationStatus.COMPLETED);
        assertThat(output.optionSummaries())
                .extracting(OptionSummary::optionKey)
                .containsExactly("O1", "O2");
        assertThatCode(() -> output.validateAgainst(llmInput()))
                .doesNotThrowAnyException();
    }

    @Test
    void acceptsInvalidInputWithUnknownIdentifiers() {
        OpinionMapOptionExplanationV1 output =
                new OpinionMapOptionExplanationV1(
                        OpinionMapOptionExplanationV1.SCHEMA_VERSION,
                        null,
                        null,
                        GenerationStatus.INVALID_INPUT,
                        "JSONL을 파싱할 수 없습니다.",
                        List.of());

        assertThat(output.error()).isNotBlank();
        assertThatCode(() -> output.validateAgainst(llmInput()))
                .doesNotThrowAnyException();
    }

    @Test
    void enforcesAreaStateBodyAndSourceKeys() {
        assertThatThrownBy(() -> new AreaSummary(
                AreaStatus.AVAILABLE, List.of("O1"), null))
                .isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new AreaSummary(
                AreaStatus.NO_RESPONSES,
                List.of(),
                "표시해서는 안 되는 문구"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("body must be null");

        assertThatThrownBy(() -> new AreaSummary(
                AreaStatus.INSUFFICIENT_REASON,
                List.of("O1"),
                null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sourceOptionKeys must be empty");
    }

    @Test
    void validatesOptionCoverageAndNoResponseStatesAgainstInput() {
        OpinionMapOptionExplanationV1 wrongOrder = completedOutput(List.of(
                availableSummary("O2", "O1"),
                availableSummary("O1", "O2")));
        assertThatThrownBy(() -> wrongOrder.validateAgainst(llmInput()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("display order");

        OptionSummary falseNoResponses = new OptionSummary(
                "O1",
                new AreaSummary(
                        AreaStatus.NO_RESPONSES, List.of(), null),
                new AreaSummary(
                        AreaStatus.AVAILABLE,
                        List.of("O2"),
                        "두 번째 선택의 이유입니다."));
        OpinionMapOptionExplanationV1 output = completedOutput(List.of(
                falseNoResponses,
                availableSummary("O2", "O1")));

        assertThatThrownBy(() -> output.validateAgainst(llmInput()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(
                        "sameChoice must not be NO_RESPONSES");
    }

    @Test
    void schemaResourceMatchesDtoContract() throws Exception {
        JsonNode schema;
        try (InputStream inputStream = requiredResource(
                OpinionMapOptionExplanationV1.JSON_SCHEMA_RESOURCE)) {
            schema = OBJECT_MAPPER.readTree(inputStream);
        }

        assertThat(schema.get("$schema").asText())
                .isEqualTo("https://json-schema.org/draft/2020-12/schema");
        assertThat(schema.get("properties")
                .get("schemaVersion")
                .get("const")
                .asText()).isEqualTo(
                OpinionMapOptionExplanationV1.SCHEMA_VERSION);
        assertThat(schema.get("properties")
                .get("status")
                .get("enum")
                .toString()).contains(
                GenerationStatus.COMPLETED.name(),
                GenerationStatus.INVALID_INPUT.name());
        assertThat(schema.get("$defs")
                .get("areaSummary")
                .get("properties")
                .get("status")
                .get("enum")
                .toString()).contains(
                AreaStatus.AVAILABLE.name(),
                AreaStatus.NO_RESPONSES.name(),
                AreaStatus.INSUFFICIENT_REASON.name());
    }

    private static OpinionMapOptionExplanationV1 completedOutput(
            List<OptionSummary> summaries
    ) {
        return new OpinionMapOptionExplanationV1(
                OpinionMapOptionExplanationV1.SCHEMA_VERSION,
                TASK_UUID,
                1,
                GenerationStatus.COMPLETED,
                null,
                summaries);
    }

    private static OptionSummary availableSummary(
            String optionKey,
            String otherOptionKey
    ) {
        return new OptionSummary(
                optionKey,
                new AreaSummary(
                        AreaStatus.AVAILABLE,
                        List.of(optionKey),
                        "같은 선택의 이유입니다."),
                new AreaSummary(
                        AreaStatus.AVAILABLE,
                        List.of(otherOptionKey),
                        "다른 선택의 이유입니다."));
    }

    private static TaskResultForLlmV1 llmInput() {
        return new TaskResultForLlmV1(
                new TaskId(TASK_UUID),
                TaskResultViewV1.SCHEMA_VERSION,
                1,
                "a".repeat(64),
                new TaskData("정책 선택", "정책 배경"),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 정책을 선택하시겠습니까?",
                        null),
                List.of(
                        new TaskResultForLlmV1.OptionData(
                                "O1", 1, "첫 번째 정책"),
                        new TaskResultForLlmV1.OptionData(
                                "O2", 2, "두 번째 정책")),
                List.of(
                        new TaskResultForLlmV1.ResponseData(
                                "R1", "O1", "검증된 절차가 필요합니다."),
                        new TaskResultForLlmV1.ResponseData(
                                "R2", "O2", "신속한 추진이 필요합니다.")));
    }

    private static InputStream requiredResource(String path) {
        InputStream inputStream = OpinionMapOptionExplanationV1Test.class
                .getClassLoader()
                .getResourceAsStream(path);
        if (inputStream == null) {
            throw new IllegalStateException("missing test resource: " + path);
        }
        return inputStream;
    }
}
