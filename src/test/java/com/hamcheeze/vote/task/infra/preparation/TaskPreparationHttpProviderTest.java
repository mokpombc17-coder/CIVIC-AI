package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderException;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationVerification;
import com.hamcheeze.vote.task.domain.common.TaskId;
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
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskPreparationHttpProviderTest {

    private static final UUID REQUEST_ID = UUID.randomUUID();
    private static final TaskId TASK_ID = new TaskId(UUID.randomUUID());
    private static final String FINGERPRINT = "sha256:"
            + "a".repeat(64);
    private static final Instant PREPARED_AT =
            Instant.parse("2026-09-02T07:00:00Z");

    private final AtomicReference<String> body = new AtomicReference<>();
    private final AtomicReference<String> authorization =
            new AtomicReference<>();
    private final AtomicReference<String> method = new AtomicReference<>();

    private HttpServer server;
    private TaskPreparationProperties properties;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.start();
        properties = new TaskPreparationProperties();
        properties.setBaseUrl("http://127.0.0.1:"
                + server.getAddress().getPort());
        properties.setPath("/v1/tasks/prepare");
        properties.setStatusPath(
                "/v1/task-preparations/{requestId}");
        properties.setAuthToken("runtime-token");
        properties.setConnectTimeout(Duration.ofSeconds(1));
        properties.setRequestTimeout(Duration.ofSeconds(1));
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void postsExactPayloadAndValidatesReadyResponse() {
        server.createContext("/v1/tasks/prepare", exchange -> {
            body.set(new String(
                    exchange.getRequestBody().readAllBytes(),
                    StandardCharsets.UTF_8));
            authorization.set(exchange.getRequestHeaders()
                    .getFirst("Authorization"));
            respond(exchange, 201, successBody());
        });

        var result = provider().prepare(command());

        assertThat(body.get()).isEqualTo("{\"task\":\"payload\"}");
        assertThat(authorization.get()).isEqualTo("Bearer runtime-token");
        assertThat(result.requestId()).isEqualTo(REQUEST_ID);
        assertThat(result.taskId()).isEqualTo(TASK_ID);
        assertThat(result.contentFingerprint()).isEqualTo(FINGERPRINT);
        assertThat(result.status()).isEqualTo(TaskPreparationStatus.READY);
        assertThat(result.preparedAt()).isEqualTo(PREPARED_AT);
    }

    @Test
    void acceptsAsynchronousProcessingResponse() {
        server.createContext("/v1/tasks/prepare", exchange -> respond(
                exchange,
                202,
                processingBody()));

        var result = provider().prepare(command());

        assertThat(result.status())
                .isEqualTo(TaskPreparationStatus.PROCESSING);
        assertThat(result.preparedAt()).isNull();
    }

    @Test
    void classifiesServerFailureAsRetryable() {
        server.createContext("/v1/tasks/prepare", exchange -> respond(
                exchange,
                503,
                "{\"code\":\"SERVICE_UNAVAILABLE\"}"));

        assertThatThrownBy(() -> provider().prepare(command()))
                .isInstanceOfSatisfying(
                        TaskPreparationProviderException.class,
                        exception -> {
                            assertThat(exception.retryable()).isTrue();
                            assertThat(exception.httpStatus()).isEqualTo(503);
                            assertThat(exception.code())
                                    .isEqualTo("SERVICE_UNAVAILABLE");
                        });
    }

    @Test
    void rejectsMismatchedSuccessResponsePermanently() {
        server.createContext("/v1/tasks/prepare", exchange -> respond(
                exchange,
                200,
                successBody().replace(
                        REQUEST_ID.toString(), UUID.randomUUID().toString())));

        assertThatThrownBy(() -> provider().prepare(command()))
                .isInstanceOfSatisfying(
                        TaskPreparationProviderException.class,
                        exception -> {
                            assertThat(exception.retryable()).isFalse();
                            assertThat(exception.code()).isEqualTo(
                                    "TASK_PREPARATION_RESPONSE_MISMATCH");
                        });
    }

    @Test
    void getsStatusByRequestIdAndValidatesReadyResponse() {
        server.createContext(
                "/v1/task-preparations/" + REQUEST_ID,
                exchange -> {
                    method.set(exchange.getRequestMethod());
                    authorization.set(exchange.getRequestHeaders()
                            .getFirst("Authorization"));
                    respond(exchange, 200, statusBody("READY"));
                });

        var result = provider().findStatus(verification());

        assertThat(method.get()).isEqualTo("GET");
        assertThat(authorization.get()).isEqualTo("Bearer runtime-token");
        assertThat(result.status()).isEqualTo(TaskPreparationStatus.READY);
        assertThat(result.preparedAt()).isEqualTo(PREPARED_AT);
    }

    @Test
    void rejectsMismatchedStatusResponsePermanently() {
        server.createContext(
                "/v1/task-preparations/" + REQUEST_ID,
                exchange -> respond(
                        exchange,
                        200,
                        statusBody("READY").replace(
                                TASK_ID.value().toString(),
                                UUID.randomUUID().toString())));

        assertThatThrownBy(() -> provider().findStatus(verification()))
                .isInstanceOfSatisfying(
                        TaskPreparationProviderException.class,
                        exception -> {
                            assertThat(exception.retryable()).isFalse();
                            assertThat(exception.code()).isEqualTo(
                                    "TASK_PREPARATION_RESPONSE_MISMATCH");
                        });
    }

    private TaskPreparationHttpProvider provider() {
        return new TaskPreparationHttpProvider(
                properties, new ObjectMapper());
    }

    private static TaskPreparationCommand command() {
        return new TaskPreparationCommand(
                1,
                REQUEST_ID,
                TASK_ID,
                FINGERPRINT,
                "{\"task\":\"payload\"}");
    }

    private static TaskPreparationVerification verification() {
        return new TaskPreparationVerification(
                1, REQUEST_ID, TASK_ID, FINGERPRINT);
    }

    private static String successBody() {
        return """
                {
                  "schemaVersion": 1,
                  "requestId": "%s",
                  "taskId": "%s",
                  "contentFingerprint": "%s",
                  "status": "READY",
                  "replayed": false,
                  "preparedAt": "%s"
                }
                """.formatted(
                REQUEST_ID,
                TASK_ID.value(),
                FINGERPRINT,
                PREPARED_AT);
    }

    private static String processingBody() {
        return """
                {
                  "schemaVersion": 1,
                  "requestId": "%s",
                  "taskId": "%s",
                  "contentFingerprint": "%s",
                  "status": "PROCESSING",
                  "replayed": false,
                  "acceptedAt": "2026-09-02T06:59:00Z",
                  "preparedAt": null
                }
                """.formatted(
                REQUEST_ID,
                TASK_ID.value(),
                FINGERPRINT);
    }

    private static String statusBody(String status) {
        return """
                {
                  "schemaVersion": 1,
                  "requestId": "%s",
                  "taskId": "%s",
                  "contentFingerprint": "%s",
                  "status": "%s",
                  "acceptedAt": "2026-09-02T06:59:00Z",
                  "preparedAt": "%s",
                  "error": null,
                  "updatedAt": "%s"
                }
                """.formatted(
                REQUEST_ID,
                TASK_ID.value(),
                FINGERPRINT,
                status,
                PREPARED_AT,
                PREPARED_AT);
    }

    private static void respond(
            HttpExchange exchange,
            int status,
            String responseBody
    ) throws IOException {
        byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add(
                "Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
