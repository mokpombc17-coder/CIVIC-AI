package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationProvider;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderException;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderResult;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Component
@ConditionalOnExpression(
        "'${vote.task.preparation.enabled:false}' == 'true' and "
                + "'${vote.task.preparation.provider:http}' == 'http'")
public class TaskPreparationHttpProvider
        implements TaskPreparationProvider {

    private final TaskPreparationProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI endpoint;

    public TaskPreparationHttpProvider(
            TaskPreparationProperties properties,
            ObjectMapper objectMapper
    ) {
        this(properties, objectMapper, HttpClient.newBuilder()
                .connectTimeout(positive(
                        properties.getConnectTimeout(), "connectTimeout"))
                .build());
    }

    TaskPreparationHttpProvider(
            TaskPreparationProperties properties,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
        this.endpoint = endpoint(properties.getBaseUrl(), properties.getPath());
    }

    @Override
    public TaskPreparationProviderResult prepare(
            TaskPreparationCommand command
    ) {
        Objects.requireNonNull(command, "command");
        try {
            HttpResponse<String> response = httpClient.send(
                    request(command),
                    HttpResponse.BodyHandlers.ofString(
                            StandardCharsets.UTF_8));
            return handle(command, response);
        } catch (HttpTimeoutException exception) {
            throw failure(true, null, "TASK_PREPARATION_TIMEOUT",
                    "Task preparation request timed out", exception);
        } catch (IOException exception) {
            throw failure(true, null, "TASK_PREPARATION_NETWORK_ERROR",
                    "Task preparation network error", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(true, null, "TASK_PREPARATION_INTERRUPTED",
                    "Task preparation request was interrupted", exception);
        }
    }

    private HttpRequest request(TaskPreparationCommand command) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(endpoint)
                .timeout(positive(
                        properties.getRequestTimeout(), "requestTimeout"))
                .header("Content-Type", "application/json; charset=UTF-8")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                        command.requestPayload(), StandardCharsets.UTF_8));
        String token = properties.getAuthToken();
        if (token != null && !token.isBlank()) {
            builder.header("Authorization", "Bearer " + token.strip());
        }
        return builder.build();
    }

    private TaskPreparationProviderResult handle(
            TaskPreparationCommand command,
            HttpResponse<String> response
    ) {
        int status = response.statusCode();
        if (status == 200 || status == 201) {
            return decode(command, response.body());
        }
        String remoteCode = errorCode(response.body());
        boolean retryable = status == 408 || status == 429
                || status >= 500 && status <= 599;
        throw failure(
                retryable,
                status,
                remoteCode == null
                        ? retryable
                        ? "TASK_PREPARATION_REMOTE_UNAVAILABLE"
                        : "TASK_PREPARATION_REMOTE_REJECTED"
                        : remoteCode,
                retryable
                        ? "Runtime could not prepare the Task temporarily"
                        : "Runtime rejected the Task preparation request",
                null);
    }

    private TaskPreparationProviderResult decode(
            TaskPreparationCommand command,
            String body
    ) {
        try {
            PreparationResponse response = objectMapper.readValue(
                    body, PreparationResponse.class);
            if (response.schemaVersion() == null
                    || response.requestId() == null
                    || response.taskId() == null
                    || response.contentFingerprint() == null
                    || !"READY".equals(response.status())
                    || response.replayed() == null
                    || response.preparedAt() == null) {
                throw new IllegalArgumentException(
                        "required response field is missing");
            }
            if (response.schemaVersion() != command.schemaVersion()
                    || !response.requestId().equals(command.requestId())
                    || !response.taskId().equals(command.taskId().value())
                    || !response.contentFingerprint().equals(
                            command.contentFingerprint())) {
                throw failure(
                        false,
                        200,
                        "TASK_PREPARATION_RESPONSE_MISMATCH",
                        "Runtime preparation response does not match request",
                        null);
            }
            return new TaskPreparationProviderResult(
                    response.schemaVersion(),
                    response.requestId(),
                    new TaskId(response.taskId()),
                    response.contentFingerprint(),
                    response.replayed(),
                    response.preparedAt());
        } catch (TaskPreparationProviderException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure(false, 200,
                    "TASK_PREPARATION_INVALID_RESPONSE",
                    "Runtime preparation response is invalid", exception);
        }
    }

    private String errorCode(String body) {
        try {
            return objectMapper.readValue(body, ProviderError.class).code();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static URI endpoint(String baseUrl, String path) {
        String base = required(baseUrl, "baseUrl");
        String suffix = required(path, "path");
        if (!suffix.startsWith("/")) {
            suffix = "/" + suffix;
        }
        return URI.create(base.endsWith("/")
                ? base.substring(0, base.length() - 1) + suffix
                : base + suffix);
    }

    private static Duration positive(Duration value, String field) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(field + " must be positive");
        }
        return value;
    }

    private static String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value.strip();
    }

    private static TaskPreparationProviderException failure(
            boolean retryable,
            Integer status,
            String code,
            String message,
            Throwable cause
    ) {
        return new TaskPreparationProviderException(
                retryable, status, code, message, cause);
    }

    record PreparationResponse(
            Integer schemaVersion,
            UUID requestId,
            UUID taskId,
            String contentFingerprint,
            String status,
            Boolean replayed,
            Instant preparedAt
    ) {
    }

    record ProviderError(String code, String detail) {
    }
}
