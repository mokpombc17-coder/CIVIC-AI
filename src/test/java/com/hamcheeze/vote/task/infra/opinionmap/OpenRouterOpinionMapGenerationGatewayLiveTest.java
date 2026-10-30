package com.hamcheeze.vote.task.infra.opinionmap;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRequest;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Opt-in paid integration test. It is skipped unless the caller explicitly
 * enables it and supplies an OpenRouter key through the environment.
 */
class OpenRouterOpinionMapGenerationGatewayLiveTest {

    private static final Path EXAMPLE = Path.of(
            "docs/examples/task-result-for-llm-v1/"
                    + "sona-simulation-results.jsonl");

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void generatesOpinionMapFromSonaExample() throws IOException {
        assumeTrue("true".equalsIgnoreCase(System.getenv(
                "VOTE_RUN_LIVE_OPENROUTER_TEST")));
        String apiKey = System.getenv("OPENROUTER_API_KEY");
        assumeTrue(apiKey != null && !apiKey.isBlank());

        String inputJsonl = Files.readString(EXAMPLE);
        TaskResultForLlmV1 input = parse(inputJsonl);

        OpinionMapGenerationProperties properties =
                new OpinionMapGenerationProperties();
        properties.setApiKey(apiKey);
        properties.setModel(environmentOrDefault(
                "VOTE_TASK_OPINION_MAP_MODEL",
                "openai/gpt-5.6-luna"));
        properties.setRequestTimeout(Duration.ofSeconds(120));

        OpinionMapGenerationRequest request =
                new OpinionMapGenerationRequest(
                        UUID.randomUUID(),
                        input,
                        inputJsonl,
                        new ClasspathOpinionMapPromptProvider().loadPrompt(),
                        properties.getPromptVersion(),
                        properties.getRequestTimeout());

        OpinionMapOptionExplanationV1 result =
                new OpenRouterOpinionMapGenerationGateway(
                        properties, objectMapper)
                        .generate(request);

        result.validateAgainst(input);
        assertThat(result.status()).isEqualTo(
                OpinionMapOptionExplanationV1.GenerationStatus.COMPLETED);
        assertThat(result.optionSummaries())
                .extracting(
                        OpinionMapOptionExplanationV1.OptionSummary::optionKey)
                .containsExactly("O1", "O2", "O3");
    }

    private TaskResultForLlmV1 parse(String jsonl) {
        List<JsonNode> lines = jsonl.lines()
                .filter(line -> !line.isBlank())
                .map(this::readTree)
                .toList();
        JsonNode manifest = line(lines, "manifest");
        JsonNode task = line(lines, "task");
        JsonNode question = line(lines, "question");

        List<TaskResultForLlmV1.OptionData> options = new ArrayList<>();
        List<TaskResultForLlmV1.ResponseData> responses = new ArrayList<>();
        for (JsonNode line : lines) {
            switch (line.path("type").asText()) {
                case "option" -> options.add(
                        new TaskResultForLlmV1.OptionData(
                                line.path("key").asText(),
                                line.path("displayOrder").asInt(),
                                line.path("content").asText()));
                case "response" -> responses.add(
                        new TaskResultForLlmV1.ResponseData(
                                line.path("responseRef").asText(),
                                line.path("selectedOptionKey").asText(),
                                line.path("reason").asText()));
                default -> {
                    // The manifest, task, and question are handled above.
                }
            }
        }

        return new TaskResultForLlmV1(
                new TaskId(UUID.fromString(
                        manifest.path("taskId").asText())),
                manifest.path("sourceSchemaVersion").asText(),
                manifest.path("resultVersion").asInt(),
                manifest.path("sourceBodySha256").asText(),
                new TaskData(
                        task.path("title").asText(),
                        nullableText(task.path("background"))),
                new QuestionData(
                        TaskQuestionType.valueOf(
                                question.path("questionType").asText()),
                        question.path("content").asText(),
                        nullableText(question.path("description"))),
                options,
                responses);
    }

    private JsonNode readTree(String line) {
        try {
            return objectMapper.readTree(line);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException(
                    "Example JSONL contains an invalid line", exception);
        }
    }

    private static JsonNode line(List<JsonNode> lines, String type) {
        return lines.stream()
                .filter(line -> type.equals(line.path("type").asText()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Example JSONL is missing type=" + type));
    }

    private static String nullableText(JsonNode node) {
        return node.isMissingNode() || node.isNull()
                ? null
                : node.asText();
    }

    private static String environmentOrDefault(
            String name,
            String defaultValue
    ) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
