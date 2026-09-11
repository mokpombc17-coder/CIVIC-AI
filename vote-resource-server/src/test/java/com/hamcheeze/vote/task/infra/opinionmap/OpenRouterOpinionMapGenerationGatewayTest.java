package com.hamcheeze.vote.task.infra.opinionmap;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationException;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRequest;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpenRouterOpinionMapGenerationGatewayTest {

    private static final UUID TASK_ID = new UUID(1, 1);
    private static final UUID GENERATION_ID = new UUID(2, 1);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicReference<String> requestBody =
            new AtomicReference<>();
    private final AtomicReference<String> authorization =
            new AtomicReference<>();

    private HttpServer server;
    private OpinionMapGenerationProperties properties;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.start();

        properties = new OpinionMapGenerationProperties();
        properties.setBaseUrl("http://127.0.0.1:"
                + server.getAddress().getPort());
        properties.setPath("/chat/completions");
        properties.setApiKey("test-openrouter-key");
        properties.setModel("openai/gpt-5.6-luna");
        properties.setMaximumOutputTokens(2048);
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void sendsStructuredOutputRequestAndDecodesResult() throws Exception {
        server.createContext("/chat/completions", exchange -> {
            capture(exchange);
            respond(exchange, 200, successResponse());
        });

        OpinionMapOptionExplanationV1 result = gateway().generate(request());

        result.validateAgainst(input());
        assertThat(result.status()).isEqualTo(
                OpinionMapOptionExplanationV1.GenerationStatus.COMPLETED);
        assertThat(result.optionSummaries()).hasSize(2);
        assertThat(authorization.get())
                .isEqualTo("Bearer test-openrouter-key");

        JsonNode body = objectMapper.readTree(requestBody.get());
        assertThat(body.path("model").asText())
                .isEqualTo("openai/gpt-5.6-luna");
        assertThat(body.path("messages").path(0).path("role").asText())
                .isEqualTo("system");
        assertThat(body.path("messages").path(0).path("content").asText())
                .isEqualTo("system prompt");
        assertThat(body.path("messages").path(1).path("content").asText())
                .isEqualTo("input jsonl");
        assertThat(body.path("response_format").path("type").asText())
                .isEqualTo("json_schema");
        assertThat(body.path("response_format").path("json_schema")
                .path("strict").asBoolean()).isTrue();
        assertThat(body.path("response_format").path("json_schema")
                .path("schema").path("additionalProperties").asBoolean())
                .isFalse();
        assertThat(body.path("provider").path("require_parameters")
                .asBoolean()).isTrue();
        assertThat(body.path("max_tokens").asInt()).isEqualTo(2048);
        assertThat(body.path("stream").asBoolean()).isFalse();
    }

    @Test
    void classifiesAuthenticationFailureAsPermanent() {
        server.createContext("/chat/completions", exchange ->
                respond(exchange, 401, "{}"));

        assertFailure(
                "OPINION_MAP_OPENROUTER_AUTH_FAILED",
                false);
    }

    @Test
    void classifiesRateLimitAsRetryable() {
        server.createContext("/chat/completions", exchange ->
                respond(exchange, 429, "{}"));

        assertFailure(
                "OPINION_MAP_OPENROUTER_RATE_LIMITED",
                true);
    }

    @Test
    void classifiesMalformedSuccessAsRetryableInvalidResponse() {
        server.createContext("/chat/completions", exchange ->
                respond(exchange, 200, "{malformed"));

        assertFailure(
                "OPINION_MAP_OPENROUTER_INVALID_RESPONSE",
                true);
    }

    private void assertFailure(String code, boolean retryable) {
        assertThatThrownBy(() -> gateway().generate(request()))
                .isInstanceOfSatisfying(
                        OpinionMapGenerationException.class,
                        exception -> {
                            assertThat(exception.errorCode())
                                    .isEqualTo(code);
                            assertThat(exception.retryable())
                                    .isEqualTo(retryable);
                        });
    }

    private OpenRouterOpinionMapGenerationGateway gateway() {
        return new OpenRouterOpinionMapGenerationGateway(
                properties, objectMapper);
    }

    private OpinionMapGenerationRequest request() {
        return new OpinionMapGenerationRequest(
                GENERATION_ID,
                input(),
                "input jsonl",
                "system prompt",
                "task-result-prompt/v1",
                Duration.ofSeconds(2));
    }

    private static TaskResultForLlmV1 input() {
        return new TaskResultForLlmV1(
                new TaskId(TASK_ID),
                "task-result-view/v1",
                1,
                "a".repeat(64),
                new TaskData("테스트 과업", "배경"),
                new QuestionData(
                        TaskQuestionType.SINGLE_CHOICE,
                        "어떤 선택을 할까요?",
                        null),
                List.of(
                        new TaskResultForLlmV1.OptionData(
                                "01", 1, "선택지 A"),
                        new TaskResultForLlmV1.OptionData(
                                "02", 2, "선택지 B")),
                List.of(
                        new TaskResultForLlmV1.ResponseData(
                                "r-01", "01", "A를 선택한 이유"),
                        new TaskResultForLlmV1.ResponseData(
                                "r-02", "02", "B를 선택한 이유")));
    }

    private String successResponse() {
        String content = """
                {
                  "schemaVersion": "opinionmap-option-explanation/v1",
                  "taskId": "%s",
                  "resultVersion": 1,
                  "status": "COMPLETED",
                  "error": null,
                  "optionSummaries": [
                    {
                      "optionKey": "01",
                      "sameChoice": {
                        "status": "AVAILABLE",
                        "sourceOptionKeys": ["01"],
                        "body": "A를 선택한 사람들의 이유"
                      },
                      "otherChoices": {
                        "status": "AVAILABLE",
                        "sourceOptionKeys": ["02"],
                        "body": "B를 선택한 사람들의 이유"
                      }
                    },
                    {
                      "optionKey": "02",
                      "sameChoice": {
                        "status": "AVAILABLE",
                        "sourceOptionKeys": ["02"],
                        "body": "B를 선택한 사람들의 이유"
                      },
                      "otherChoices": {
                        "status": "AVAILABLE",
                        "sourceOptionKeys": ["01"],
                        "body": "A를 선택한 사람들의 이유"
                      }
                    }
                  ]
                }
                """.formatted(TASK_ID);
        try {
            return "{\"choices\":[{\"finish_reason\":\"stop\","
                    + "\"message\":{\"content\":"
                    + objectMapper.writeValueAsString(content)
                    + "}}]}";
        } catch (RuntimeException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private void capture(HttpExchange exchange) throws IOException {
        authorization.set(exchange.getRequestHeaders()
                .getFirst("Authorization"));
        requestBody.set(new String(
                exchange.getRequestBody().readAllBytes(),
                StandardCharsets.UTF_8));
    }

    private static void respond(
            HttpExchange exchange,
            int status,
            String body
    ) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set(
                "Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
