package com.hamcheeze.vote.task.infra.opinionmap;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationException;
import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationRequest;
import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationGateway;
import com.hamcheeze.vote.task.application.result.OpinionMapOptionExplanationV1;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Component
@ConditionalOnExpression(
        "'${vote.task.opinion-map.enabled:false}' == 'true' and "
                + "'${vote.task.opinion-map.provider:none}' == 'openrouter'")
public final class OpenRouterOpinionMapGenerationGateway
        implements OpinionMapGenerationGateway {

    private static final String OUTPUT_SCHEMA_RESOURCE =
            "schemas/opinionmap-option-explanation-openrouter-v1.schema.json";

    private final OpinionMapGenerationProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI endpoint;
    private final JsonNode outputSchema;

    @Autowired
    public OpenRouterOpinionMapGenerationGateway(
            OpinionMapGenerationProperties properties,
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

    OpenRouterOpinionMapGenerationGateway(
            OpinionMapGenerationProperties properties,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
        this.endpoint = endpoint(
                properties.getBaseUrl(), properties.getPath());
        required(properties.getApiKey(), "apiKey");
        required(properties.getModel(), "model");
        if (properties.getMaximumOutputTokens() < 1) {
            throw new IllegalArgumentException(
                    "maximumOutputTokens must be positive");
        }
        this.outputSchema = loadOutputSchema(objectMapper);
    }

    @Override
    public OpinionMapOptionExplanationV1 generate(
            OpinionMapGenerationRequest request
    ) {
        Objects.requireNonNull(request, "request");
        HttpRequest httpRequest = request(request);
        try {
            HttpResponse<String> response = httpClient.send(
                    httpRequest,
                    HttpResponse.BodyHandlers.ofString(
                            StandardCharsets.UTF_8));
            return handle(response);
        } catch (HttpTimeoutException exception) {
            throw failure(
                    "OPINION_MAP_OPENROUTER_TIMEOUT",
                    true,
                    "OpenRouter request timed out",
                    exception);
        } catch (IOException exception) {
            throw failure(
                    "OPINION_MAP_OPENROUTER_NETWORK_ERROR",
                    true,
                    "OpenRouter network error",
                    exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(
                    "OPINION_MAP_OPENROUTER_INTERRUPTED",
                    true,
                    "OpenRouter request was interrupted",
                    exception);
        }
    }

    private HttpRequest request(OpinionMapGenerationRequest request) {
        try {
            String payload = objectMapper.writeValueAsString(Map.of(
                    "model", required(properties.getModel(), "model"),
                    "messages", List.of(
                            Map.of(
                                    "role", "system",
                                    "content", request.prompt()),
                            Map.of(
                                    "role", "user",
                                    "content", request.inputJsonl())),
                    "response_format", Map.of(
                            "type", "json_schema",
                            "json_schema", Map.of(
                                    "name", "opinionmap_option_explanation_v1",
                                    "strict", true,
                                    "schema", outputSchema)),
                    "provider", Map.of("require_parameters", true),
                    "max_tokens", properties.getMaximumOutputTokens(),
                    "stream", false));
            return HttpRequest.newBuilder(endpoint)
                    .timeout(positive(
                            request.requestTimeout(), "requestTimeout"))
                    .header("Authorization", "Bearer " + required(
                            properties.getApiKey(), "apiKey"))
                    .header("Content-Type",
                            "application/json; charset=UTF-8")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            payload, StandardCharsets.UTF_8))
                    .build();
        } catch (OpinionMapGenerationException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure(
                    "OPINION_MAP_OPENROUTER_REQUEST_INVALID",
                    false,
                    "OpenRouter request could not be created",
                    exception);
        }
    }

    private OpinionMapOptionExplanationV1 handle(
            HttpResponse<String> response
    ) {
        int status = response.statusCode();
        if (status >= 200 && status <= 299) {
            return decode(response.body());
        }
        boolean retryable = status == 408 || status == 429
                || status >= 500 && status <= 599;
        String errorCode = switch (status) {
            case 401, 403 -> "OPINION_MAP_OPENROUTER_AUTH_FAILED";
            case 402 -> "OPINION_MAP_OPENROUTER_CREDIT_UNAVAILABLE";
            case 408 -> "OPINION_MAP_OPENROUTER_REMOTE_TIMEOUT";
            case 429 -> "OPINION_MAP_OPENROUTER_RATE_LIMITED";
            default -> retryable
                    ? "OPINION_MAP_OPENROUTER_UNAVAILABLE"
                    : "OPINION_MAP_OPENROUTER_REJECTED";
        };
        throw failure(
                errorCode,
                retryable,
                retryable
                        ? "OpenRouter is temporarily unavailable"
                        : "OpenRouter rejected the request",
                null);
    }

    private OpinionMapOptionExplanationV1 decode(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode choice = root.path("choices").path(0);
            String finishReason = text(choice, "finish_reason");
            JsonNode message = choice.path("message");
            if (!message.path("refusal").isMissingNode()
                    && !message.path("refusal").isNull()) {
                throw failure(
                        "OPINION_MAP_OPENROUTER_REFUSED",
                        false,
                        "OpenRouter refused the request",
                        null);
            }
            if (!"stop".equals(finishReason)) {
                throw failure(
                        "OPINION_MAP_OPENROUTER_INCOMPLETE",
                        !"content_filter".equals(finishReason),
                        "OpenRouter response was incomplete",
                        null);
            }
            String content = text(message, "content");
            return objectMapper.readValue(
                    content, OpinionMapOptionExplanationV1.class);
        } catch (OpinionMapGenerationException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure(
                    "OPINION_MAP_OPENROUTER_INVALID_RESPONSE",
                    true,
                    "OpenRouter response was invalid",
                    exception);
        }
    }

    private static String text(JsonNode parent, String field) {
        JsonNode value = parent.path(field);
        if (!value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException(
                    field + " must be a non-blank string");
        }
        return value.asText();
    }

    private static JsonNode loadOutputSchema(ObjectMapper objectMapper) {
        try (var inputStream = new ClassPathResource(
                OUTPUT_SCHEMA_RESOURCE).getInputStream()) {
            return objectMapper.readTree(inputStream);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "OpenRouter Opinion Map output schema could not be loaded",
                    exception);
        }
    }

    private static URI endpoint(String baseUrl, String path) {
        String base = required(baseUrl, "baseUrl");
        String endpointPath = required(path, "path");
        try {
            return URI.create(base.endsWith("/")
                    ? base.substring(0, base.length() - 1)
                    + requireLeadingSlash(endpointPath)
                    : base + requireLeadingSlash(endpointPath));
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException(
                    "OpenRouter endpoint is invalid", exception);
        }
    }

    private static String requireLeadingSlash(String path) {
        return path.startsWith("/") ? path : "/" + path;
    }

    private static Duration positive(Duration value, String name) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive");
        }
        return value;
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return value.strip();
    }

    private static OpinionMapGenerationException failure(
            String errorCode,
            boolean retryable,
            String message,
            Throwable cause
    ) {
        return new OpinionMapGenerationException(
                errorCode, retryable, message, cause);
    }
}
