package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationException;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskPersonaId;
import com.hamcheeze.vote.task.domain.common.TaskPredictionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.task.SingleChoiceConstraint;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import com.hamcheeze.vote.task.domain.task.TaskQuestionType;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskPredictionHttpCreationAdapterTest {

    private static final UUID TASK_ID = new UUID(1, 1);
    private static final UUID QUESTION_ID = new UUID(2, 1);
    private static final UUID REQUEST_ID = new UUID(3, 1);
    private static final UUID FIRST_OPTION_ID = new UUID(5, 1);
    private static final UUID SECOND_OPTION_ID = new UUID(5, 2);
    private static final UUID THIRD_CANDIDATE_ID = new UUID(4, 3);
    private static final UUID FOURTH_CANDIDATE_ID = new UUID(4, 4);

    private HttpServer server;
    private TaskPredictionProperties properties;
    private final AtomicReference<String> requestBody =
            new AtomicReference<>();
    private final AtomicReference<String> authorization =
            new AtomicReference<>();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.start();
        properties = new TaskPredictionProperties();
        properties.setBaseUrl("http://127.0.0.1:"
                + server.getAddress().getPort());
        properties.setPath("/custom/task-predictions");
        properties.setAuthToken("test-ai-token");
        properties.setConnectTimeout(Duration.ofSeconds(1));
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void postsImmutableTaskWithoutInternalUserIdAndDecodesCandidates()
            throws Exception {
        server.createContext("/custom/task-predictions", exchange -> {
            capture(exchange);
            respond(exchange, 200, successBody(
                    REQUEST_ID, TASK_ID,
                    new UUID(4, 1), new UUID(4, 2)));
        });

        var result = adapter().create(command(Duration.ofSeconds(1)));

        assertThat(result.requestId().value()).isEqualTo(REQUEST_ID);
        assertThat(result.taskId().value()).isEqualTo(TASK_ID);
        assertThat(result.predictedReasons()).hasSize(4);
        assertThat(result.predictedReasons())
                .extracting(candidate -> candidate.reason())
                .containsExactly(
                        "A 첫 번째 이유", "A 두 번째 이유",
                        "B 첫 번째 이유", "B 두 번째 이유");
        assertThat(authorization.get()).isEqualTo("Bearer test-ai-token");
        assertThat(requestBody.get())
                .contains(
                        "\"schemaVersion\":1",
                        "\"requestId\":\"" + REQUEST_ID + "\"",
                        "\"personaId\":\"persona-a\"",
                        "\"candidatePolicyVersion\":\"policy-v1\"",
                        "\"requestedCandidateCount\":2",
                        "\"taskId\":\"" + TASK_ID + "\"",
                        "하나를 선택하세요",
                        "선택지 A",
                        "선택지 B")
                .doesNotContain("user-a", "userId");
    }

    @Test
    void treatsMalformedAndMismatchedResponsesAsPermanentFailures() {
        server.createContext("/custom/task-predictions", exchange ->
                respond(exchange, 200, "{malformed"));

        assertFailure(
                () -> adapter().create(command(Duration.ofSeconds(1))),
                TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                "AI_PREDICTION_INVALID_RESPONSE",
                false,
                200);

        server.removeContext("/custom/task-predictions");
        server.createContext("/custom/task-predictions", exchange ->
                respond(exchange, 200, successBody(
                        UUID.randomUUID(), TASK_ID,
                        new UUID(4, 1), new UUID(4, 2))));

        assertFailure(
                () -> adapter().create(command(Duration.ofSeconds(1))),
                TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                "AI_PREDICTION_INVALID_RESPONSE",
                false,
                200);
    }

    @Test
    void classifiesFourHundredAsPermanentAndFiveHundredAsRetryable() {
        server.createContext("/custom/task-predictions", exchange ->
                respond(exchange, 422, "{\"code\":\"INVALID_TASK\"}"));

        assertFailure(
                () -> adapter().create(command(Duration.ofSeconds(1))),
                TaskPredictionAttemptOutcome.HTTP_ERROR,
                "AI_PREDICTION_CLIENT_ERROR",
                false,
                422);

        server.removeContext("/custom/task-predictions");
        server.createContext("/custom/task-predictions", exchange ->
                respond(exchange, 503, "{\"code\":\"OVERLOADED\"}"));

        assertFailure(
                () -> adapter().create(command(Duration.ofSeconds(1))),
                TaskPredictionAttemptOutcome.HTTP_ERROR,
                "AI_PREDICTION_SERVER_ERROR",
                true,
                503);
    }

    @Test
    void classifiesRequestTimeoutAsRetryable() {
        server.createContext("/custom/task-predictions", exchange -> {
            try {
                Thread.sleep(150);
                respond(exchange, 200, successBody(
                        REQUEST_ID, TASK_ID,
                        new UUID(4, 1), new UUID(4, 2)));
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } catch (IOException ignored) {
                // Client timeout closes the exchange before the fake replies.
            }
        });

        assertFailure(
                () -> adapter().create(command(Duration.ofMillis(20))),
                TaskPredictionAttemptOutcome.TIMEOUT,
                "AI_PREDICTION_TIMEOUT",
                true,
                null);
    }

    @Test
    void classifiesConnectionFailureAsRetryableNetworkError() {
        server.stop(0);
        server = null;

        assertFailure(
                () -> adapter().create(command(Duration.ofSeconds(1))),
                TaskPredictionAttemptOutcome.NETWORK_ERROR,
                "AI_PREDICTION_NETWORK_ERROR",
                true,
                null);
    }

    @Test
    void duplicateSynchronousResponseKeepsExternalCandidateIdentity()
            throws Exception {
        UUID firstCandidate = new UUID(4, 1);
        UUID secondCandidate = new UUID(4, 2);
        server.createContext("/custom/task-predictions", exchange ->
                respond(exchange, 200, successBody(
                        REQUEST_ID, TASK_ID,
                        firstCandidate, secondCandidate)));

        var first = adapter().create(command(Duration.ofSeconds(1)));
        var duplicate = adapter().create(command(Duration.ofSeconds(1)));

        assertThat(first.predictedReasons())
                .extracting(candidate -> candidate.id().value())
                .containsExactly(
                        firstCandidate, secondCandidate,
                        THIRD_CANDIDATE_ID, FOURTH_CANDIDATE_ID);
        assertThat(duplicate.predictedReasons())
                .extracting(candidate -> candidate.id().value())
                .containsExactly(
                        firstCandidate, secondCandidate,
                        THIRD_CANDIDATE_ID, FOURTH_CANDIDATE_ID);
    }

    private TaskPredictionHttpCreationAdapter adapter() {
        return new TaskPredictionHttpCreationAdapter(
                properties, new ObjectMapper());
    }

    private static PredictionCreationCommand command(Duration timeout) {
        TaskQuestion question = new TaskQuestion(
                new TaskQuestionId(QUESTION_ID),
                1,
                TaskQuestionType.SINGLE_CHOICE,
                "하나를 선택하세요",
                "구체적인 이유도 함께 생각해 주세요",
                new SingleChoiceConstraint(),
                List.of(
                        TaskOption.standard(
                                new TaskOptionId(FIRST_OPTION_ID),
                                1,
                                "선택지 A"),
                        TaskOption.standard(
                                new TaskOptionId(SECOND_OPTION_ID),
                                2,
                                "선택지 B")));
        Task task = Task.draft(
                new TaskId(TASK_ID),
                "테스트 과업",
                "AI 예상 답변용 과업",
                List.of(question),
                Instant.parse("2026-08-18T00:00:00Z"));
        return new PredictionCreationCommand(
                new TaskPredictionId(REQUEST_ID),
                new TaskPersonaId("persona-a"),
                task,
                "policy-v1",
                timeout);
    }

    private void capture(HttpExchange exchange) throws IOException {
        requestBody.set(new String(
                exchange.getRequestBody().readAllBytes(),
                StandardCharsets.UTF_8));
        authorization.set(exchange.getRequestHeaders()
                .getFirst("Authorization"));
    }

    private static void respond(
            HttpExchange exchange,
            int status,
            String body
    ) throws IOException {
        exchange.getRequestBody().readAllBytes();
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set(
                "Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static String successBody(
            UUID requestId,
            UUID taskId,
            UUID firstCandidate,
            UUID secondCandidate
    ) {
        return """
                {
                  "schemaVersion": 1,
                  "requestId": "%s",
                  "taskId": "%s",
                  "candidates": [
                    {
                      "candidateId": "%s",
                      "questionId": "%s",
                      "candidateOrder": 1,
                      "answer": {
                        "type": "SINGLE_CHOICE",
                        "selection": {"optionId": "%s"}
                      },
                      "rationale": "A 첫 번째 이유"
                    },
                    {
                      "candidateId": "%s",
                      "questionId": "%s",
                      "candidateOrder": 2,
                      "answer": {
                        "type": "SINGLE_CHOICE",
                        "selection": {"optionId": "%s"}
                      },
                      "rationale": "A 두 번째 이유"
                    },
                    {
                      "candidateId": "%s",
                      "questionId": "%s",
                      "candidateOrder": 1,
                      "answer": {
                        "type": "SINGLE_CHOICE",
                        "selection": {"optionId": "%s"}
                      },
                      "rationale": "B 첫 번째 이유"
                    },
                    {
                      "candidateId": "%s",
                      "questionId": "%s",
                      "candidateOrder": 2,
                      "answer": {
                        "type": "SINGLE_CHOICE",
                        "selection": {"optionId": "%s"}
                      },
                      "rationale": "B 두 번째 이유"
                    }
                  ]
                }
                """.formatted(
                        requestId,
                        taskId,
                        firstCandidate,
                        QUESTION_ID,
                        FIRST_OPTION_ID,
                        secondCandidate,
                        QUESTION_ID,
                        FIRST_OPTION_ID,
                        THIRD_CANDIDATE_ID,
                        QUESTION_ID,
                        SECOND_OPTION_ID,
                        FOURTH_CANDIDATE_ID,
                        QUESTION_ID,
                        SECOND_OPTION_ID);
    }

    private static void assertFailure(
            ThrowingCall call,
            TaskPredictionAttemptOutcome outcome,
            String code,
            boolean retryable,
            Integer httpStatus
    ) {
        assertThatThrownBy(call::run)
                .isInstanceOfSatisfying(
                        PredictionCreationException.class,
                        exception -> {
                            assertThat(exception.outcome())
                                    .isEqualTo(outcome);
                            assertThat(exception.errorCode())
                                    .isEqualTo(code);
                            assertThat(exception.retryable())
                                    .isEqualTo(retryable);
                            assertThat(exception.httpStatus())
                                    .isEqualTo(httpStatus);
                        });
    }

    @FunctionalInterface
    private interface ThrowingCall {
        void run() throws Exception;
    }
}
