package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationProvider;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderException;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderResult;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationRemoteStatus;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationResult;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationStatus;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationVerification;
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
    private final URI prepareEndpoint;
    private final String statusPath;

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
        this.prepareEndpoint = endpoint(
                properties.getBaseUrl(), properties.getPath());
        this.statusPath = required(
                properties.getStatusPath(), "statusPath");
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

    @Override
    public TaskPreparationRemoteStatus findStatus(
            TaskPreparationVerification verification
    ) {
        Objects.requireNonNull(verification, "verification");
        try {
            HttpResponse<String> response = httpClient.send(
                    statusRequest(verification.requestId()),
                    HttpResponse.BodyHandlers.ofString(
                            StandardCharsets.UTF_8));
            return handleStatus(verification, response);
        } catch (HttpTimeoutException exception) {
            throw failure(true, null,
                    "TASK_PREPARATION_STATUS_TIMEOUT",
                    "Task preparation status request timed out", exception);
        } catch (IOException exception) {
            throw failure(true, null,
                    "TASK_PREPARATION_STATUS_NETWORK_ERROR",
                    "Task preparation status network error", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(true, null,
                    "TASK_PREPARATION_STATUS_INTERRUPTED",
                    "Task preparation status request was interrupted",
                    exception);
        }
    }

    private HttpRequest request(TaskPreparationCommand command) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(prepareEndpoint)
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

    private HttpRequest statusRequest(UUID requestId) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(
                        statusEndpoint(requestId))
                .timeout(positive(
                        properties.getRequestTimeout(), "requestTimeout"))
                .header("Accept", "application/json")
                .GET();
        authorize(builder);
        return builder.build();
    }

    private void authorize(HttpRequest.Builder builder) {
        String token = properties.getAuthToken();
        if (token != null && !token.isBlank()) {
            builder.header("Authorization", "Bearer " + token.strip());
        }
    }

    private TaskPreparationProviderResult handle(
            TaskPreparationCommand command,
            HttpResponse<String> response
    ) {
        int status = response.statusCode();
        if (status == 200 || status == 201) {
            return decode(
                    command, response.body(), TaskPreparationStatus.READY);
        }
        if (status == 202) {
            return decode(
                    command, response.body(),
                    TaskPreparationStatus.PROCESSING);
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

    private TaskPreparationRemoteStatus handleStatus(
            TaskPreparationVerification verification,
            HttpResponse<String> response
    ) {
        int status = response.statusCode();
        if (status == 200) {
            return decodeStatus(verification, response.body());
        }
        String remoteCode = errorCode(response.body());
        boolean retryable = status == 408 || status == 429
                || status >= 500 && status <= 599;
        throw failure(
                retryable,
                status,
                remoteCode == null
                        ? retryable
                        ? "TASK_PREPARATION_STATUS_UNAVAILABLE"
                        : "TASK_PREPARATION_STATUS_REJECTED"
                        : remoteCode,
                retryable
                        ? "Runtime status could not be verified"
                        : "Runtime status request was rejected",
                null);
    }

    private TaskPreparationProviderResult decode(
            TaskPreparationCommand command,
            String body,
            TaskPreparationStatus expectedStatus
    ) {
        try {
            PreparationResponse response = objectMapper.readValue(
                    body, PreparationResponse.class);
            TaskPreparationStatus responseStatus =
                    TaskPreparationStatus.valueOf(response.status());
            if (response.schemaVersion() == null
                    || response.requestId() == null
                    || response.taskId() == null
                    || response.contentFingerprint() == null
                    || response.replayed() == null
                    || responseStatus != expectedStatus
                    || responseStatus == TaskPreparationStatus.PROCESSING
                    && response.acceptedAt() == null
                    || responseStatus == TaskPreparationStatus.READY
                    && response.preparedAt() == null
                    || responseStatus == TaskPreparationStatus.PROCESSING
                    && response.preparedAt() != null) {
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
                    responseStatus,
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

    private TaskPreparationRemoteStatus decodeStatus(
            TaskPreparationVerification verification,
            String body
    ) {
        try {
            StatusResponse response = objectMapper.readValue(
                    body, StatusResponse.class);
            if (response.schemaVersion() == null
                    || response.requestId() == null
                    || response.taskId() == null
                    || response.contentFingerprint() == null
                    || response.status() == null
                    || response.acceptedAt() == null
                    || response.updatedAt() == null) {
                throw new IllegalArgumentException(
                        "required response field is missing");
            }
            if (response.schemaVersion() != verification.schemaVersion()
                    || !response.requestId().equals(
                            verification.requestId())
                    || !response.taskId().equals(
                            verification.taskId().value())
                    || !response.contentFingerprint().equals(
                            verification.contentFingerprint())) {
                throw failure(
                        false,
                        200,
                        "TASK_PREPARATION_RESPONSE_MISMATCH",
                        "Runtime status does not match preparation",
                        null);
            }
            StatusError responseError = response.error();
            if (responseError != null
                    && responseError.retryable() == null) {
                throw new IllegalArgumentException(
                        "error.retryable is required");
            }
            return new TaskPreparationRemoteStatus(
                    response.schemaVersion(),
                    response.requestId(),
                    new TaskId(response.taskId()),
                    response.contentFingerprint(),
                    TaskPreparationStatus.valueOf(response.status()),
                    response.acceptedAt(),
                    response.preparedAt(),
                    responseError == null ? null
                            : new TaskPreparationResult.Error(
                            responseError.code(),
                            responseError.detail(),
                            responseError.retryable()),
                    response.updatedAt());
        } catch (TaskPreparationProviderException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure(false, 200,
                    "TASK_PREPARATION_INVALID_RESPONSE",
                    "Runtime preparation status response is invalid",
                    exception);
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

    private URI statusEndpoint(UUID requestId) {
        if (!statusPath.contains("{requestId}")) {
            throw new IllegalArgumentException(
                    "statusPath must contain {requestId}");
        }
        return endpoint(
                properties.getBaseUrl(),
                statusPath.replace(
                        "{requestId}", requestId.toString()));
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
            Instant acceptedAt,
            Instant preparedAt
    ) {
    }

    record StatusResponse(
            Integer schemaVersion,
            UUID requestId,
            UUID taskId,
            String contentFingerprint,
            String status,
            Instant acceptedAt,
            Instant preparedAt,
            StatusError error,
            Instant updatedAt
    ) {
    }

    record StatusError(
            String code,
            String detail,
            Boolean retryable
    ) {
    }

    record ProviderError(String code, String detail) {
    }
}
