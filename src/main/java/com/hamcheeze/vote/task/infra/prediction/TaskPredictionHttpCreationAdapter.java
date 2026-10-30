package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationException;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationResult;
import com.hamcheeze.vote.task.application.prediction.PredictionRemoteProcessingException;
import com.hamcheeze.vote.task.domain.prediction.SanitizedTaskPredictionPayload;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionAttemptOutcome;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRuntimeStatus;
import org.springframework.beans.factory.annotation.Autowired;
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
import java.util.Objects;

@Component
@ConditionalOnExpression(
        "'${vote.task.prediction.enabled:false}' == 'true' and "
                + "'${vote.task.prediction.provider:http}' == 'http'")
public class TaskPredictionHttpCreationAdapter
        implements PredictionCreationPort {

    private static final int MAX_AUDIT_BODY_LENGTH = 16_384;

    private final TaskPredictionProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI endpoint;

    @Autowired
    public TaskPredictionHttpCreationAdapter(
            TaskPredictionProperties properties,
            ObjectMapper objectMapper
    ) {
        this(
                properties,
                objectMapper,
                HttpClient.newBuilder()
                        .connectTimeout(positive(
                                properties.getConnectTimeout(),
                                "connectTimeout"))
                        .build());
    }

    TaskPredictionHttpCreationAdapter(
            TaskPredictionProperties properties,
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
    public PredictionCreationResult create(
            PredictionCreationCommand command
    ) {
        Objects.requireNonNull(command, "command");
        requireSupportedSchemaVersion(command);
        HttpRequest request = request(command);
        try {
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString(
                            StandardCharsets.UTF_8));
            return handleResponse(command, response);
        } catch (HttpTimeoutException exception) {
            throw failure(
                    TaskPredictionAttemptOutcome.TIMEOUT,
                    true,
                    null,
                    "AI_PREDICTION_TIMEOUT",
                    "task prediction request timed out",
                    null,
                    exception);
        } catch (IOException exception) {
            throw failure(
                    TaskPredictionAttemptOutcome.NETWORK_ERROR,
                    true,
                    null,
                    "AI_PREDICTION_NETWORK_ERROR",
                    "task prediction network error",
                    null,
                    exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(
                    TaskPredictionAttemptOutcome.NETWORK_ERROR,
                    true,
                    null,
                    "AI_PREDICTION_INTERRUPTED",
                    "task prediction request was interrupted",
                    null,
                    exception);
        }
    }

    private HttpRequest request(PredictionCreationCommand command) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(endpoint)
                    .timeout(positive(
                            command.requestTimeout(), "requestTimeout"))
                    .header("Content-Type",
                            "application/json; charset=UTF-8")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            command.requestPayload(),
                            StandardCharsets.UTF_8));
            String authToken = properties.getAuthToken();
            if (authToken != null && !authToken.isBlank()) {
                builder.header(
                        "Authorization", "Bearer " + authToken.strip());
            }
            return builder.build();
        } catch (RuntimeException exception) {
            throw failure(
                    TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                    false,
                    null,
                    "AI_PREDICTION_REQUEST_ENCODING_FAILED",
                    "task prediction request could not be encoded",
                    null,
                    exception);
        }
    }

    private PredictionCreationResult handleResponse(
            PredictionCreationCommand command,
            HttpResponse<String> response
    ) {
        int status = response.statusCode();
        if (status == 200 || status == 201) {
            return decodeSuccess(command, status, response.body());
        }
        SanitizedTaskPredictionPayload payload = auditPayload(
                status, response.body());
        if (status == 202) {
            TaskPredictionRuntimeStatus runtimeStatus = runtimeStatus(
                    response.body(), status, "PREDICTION_NOT_READY", true);
            throw new PredictionRemoteProcessingException(
                    status, runtimeStatus, payload);
        }
        if (status == 402) {
            TaskPredictionRuntimeStatus runtimeStatus = runtimeStatus(
                    response.body(), status, "PREDICTION_UNAVAILABLE", false);
            throw new PredictionCreationException(
                    TaskPredictionAttemptOutcome.HTTP_ERROR,
                    false,
                    status,
                    runtimeStatus.code(),
                    runtimeStatus.detail(),
                    payload,
                    runtimeStatus,
                    null);
        }
        if (status == 408 || status == 429
                || (status >= 500 && status <= 599)) {
            throw failure(
                    TaskPredictionAttemptOutcome.HTTP_ERROR,
                    true,
                    status,
                    status == 408 ? "AI_PREDICTION_REMOTE_TIMEOUT"
                            : status == 429 ? "AI_PREDICTION_RATE_LIMITED"
                            : "AI_PREDICTION_SERVER_ERROR",
                    "task prediction request is retryable",
                    payload,
                    null);
        }
        String structuredCode = structuredErrorCode(response.body());
        if (status == 409
                && "IDEMPOTENCY_CONFLICT".equals(structuredCode)) {
            throw failure(
                    TaskPredictionAttemptOutcome.HTTP_ERROR,
                    false,
                    status,
                    "AI_PREDICTION_IDEMPOTENCY_CONFLICT",
                    "predictionId was reused with different immutable input",
                    payload,
                    null);
        }
        throw failure(
                TaskPredictionAttemptOutcome.HTTP_ERROR,
                false,
                status,
                status >= 400 && status <= 499
                        ? "AI_PREDICTION_CLIENT_ERROR"
                        : "AI_PREDICTION_UNEXPECTED_STATUS",
                "task prediction request was rejected",
                payload,
                null);
    }

    private String structuredErrorCode(String body) {
        try {
            return objectMapper.readValue(
                    body,
                    TaskPredictionHttpModels.ProviderError.class).code();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private TaskPredictionRuntimeStatus runtimeStatus(
            String body,
            int httpStatus,
            String expectedCode,
            boolean expectedRetryable
    ) {
        try {
            TaskPredictionHttpModels.ProviderError error =
                    objectMapper.readValue(
                            body,
                            TaskPredictionHttpModels.ProviderError.class);
            if (!expectedCode.equals(error.code())) {
                throw new IllegalArgumentException(
                        "provider error code does not match HTTP status");
            }
            if (error.retryable() == null
                    || error.retryable() != expectedRetryable) {
                throw new IllegalArgumentException(
                        "provider retryable does not match HTTP status");
            }
            if (error.maxWaitMinutes() == null) {
                throw new IllegalArgumentException(
                        "provider maxWaitMinutes is required");
            }
            if (httpStatus == 402 && error.maxWaitMinutes() != 0) {
                throw new IllegalArgumentException(
                        "402 maxWaitMinutes must be 0");
            }
            return new TaskPredictionRuntimeStatus(
                    error.code(),
                    error.detail(),
                    error.retryable(),
                    error.maxWaitMinutes());
        } catch (PredictionCreationException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure(
                    TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                    false,
                    httpStatus,
                    "AI_PREDICTION_INVALID_ERROR_RESPONSE",
                    "task prediction error response is invalid",
                    auditPayload(httpStatus, body),
                    exception);
        }
    }

    private PredictionCreationResult decodeSuccess(
            PredictionCreationCommand command,
            int status,
            String responseBody
    ) {
        try {
            TaskPredictionHttpModels.PredictionResponse response =
                    objectMapper.readValue(
                            responseBody,
                            TaskPredictionHttpModels
                                    .PredictionResponse.class);
            var candidates = switch (command.requestSchemaVersion()) {
                case 1, 2, TaskPredictionHttpModels.SCHEMA_VERSION ->
                        response.toDomain(command);
                default -> throw unsupportedSchemaVersion(command);
            };
            return new PredictionCreationResult(
                    command.requestId(),
                    command.task().id(),
                    candidates,
                    status,
                    canonicalPayload(response));
        } catch (PredictionCreationException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure(
                    TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                    false,
                    status,
                    "AI_PREDICTION_INVALID_RESPONSE",
                    "task prediction response is invalid",
                    auditPayload(status, responseBody),
                    exception);
        }
    }

    private static void requireSupportedSchemaVersion(
            PredictionCreationCommand command
    ) {
        switch (command.requestSchemaVersion()) {
            case 1, 2, TaskPredictionHttpModels.SCHEMA_VERSION -> {
                return;
            }
            default -> throw unsupportedSchemaVersion(command);
        }
    }

    private static PredictionCreationException unsupportedSchemaVersion(
            PredictionCreationCommand command
    ) {
        return failure(
                TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                false,
                null,
                "TASK_PREDICTION_REQUEST_SCHEMA_UNSUPPORTED",
                "stored task prediction request schema version is unsupported: "
                        + command.requestSchemaVersion(),
                null,
                null);
    }

    private SanitizedTaskPredictionPayload canonicalPayload(Object value) {
        try {
            return SanitizedTaskPredictionPayload.fromSanitized(
                    objectMapper.writeValueAsString(value));
        } catch (RuntimeException exception) {
            throw failure(
                    TaskPredictionAttemptOutcome.INVALID_RESPONSE,
                    false,
                    200,
                    "AI_PREDICTION_INVALID_RESPONSE",
                    "task prediction response could not be normalized",
                    null,
                    exception);
        }
    }

    private SanitizedTaskPredictionPayload auditPayload(
            int status,
            String body
    ) {
        String safeBody = body == null ? "" : body;
        if (safeBody.length() > MAX_AUDIT_BODY_LENGTH) {
            safeBody = safeBody.substring(0, MAX_AUDIT_BODY_LENGTH);
        }
        try {
            return SanitizedTaskPredictionPayload.fromSanitized(
                    objectMapper.writeValueAsString(
                            new TaskPredictionHttpModels.ErrorPayload(
                                    status, safeBody)));
        } catch (RuntimeException exception) {
            return SanitizedTaskPredictionPayload.fromSanitized(
                    "{\"httpStatus\":" + status
                            + ",\"responseBodyUnavailable\":true}");
        }
    }

    private static PredictionCreationException failure(
            TaskPredictionAttemptOutcome outcome,
            boolean retryable,
            Integer httpStatus,
            String code,
            String message,
            SanitizedTaskPredictionPayload responsePayload,
            Throwable cause
    ) {
        return new PredictionCreationException(
                outcome, retryable, httpStatus, code, message,
                responsePayload, cause);
    }

    private static URI endpoint(String baseUrl, String path) {
        String base = requiredText(baseUrl, "baseUrl");
        String relativePath = requiredText(path, "path");
        URI baseUri = URI.create(base.endsWith("/") ? base : base + "/");
        String scheme = baseUri.getScheme();
        if (!("http".equalsIgnoreCase(scheme)
                || "https".equalsIgnoreCase(scheme))) {
            throw new IllegalArgumentException(
                    "baseUrl must use http or https");
        }
        while (relativePath.startsWith("/")) {
            relativePath = relativePath.substring(1);
        }
        return baseUri.resolve(relativePath);
    }

    private static Duration positive(Duration value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(field + " must be positive");
        }
        return value;
    }

    private static String requiredText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value.strip();
    }
}
