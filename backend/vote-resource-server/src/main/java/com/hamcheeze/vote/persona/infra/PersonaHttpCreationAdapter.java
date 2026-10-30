package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaCreationErrorCode;
import com.hamcheeze.vote.persona.application.PersonaCreationException;
import com.hamcheeze.vote.persona.application.PersonaCreationResult;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.util.Objects;
import java.util.UUID;

public class PersonaHttpCreationAdapter implements PersonaCreationPort {

    private static final String CREATE_PATH = "v1/personas";

    private final PersonaGenerationProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI endpoint;

    @Autowired
    public PersonaHttpCreationAdapter(
            PersonaGenerationProperties properties,
            ObjectMapper objectMapper
    ) {
        this(
                properties,
                objectMapper,
                HttpClient.newBuilder()
                        .connectTimeout(properties.getConnectTimeout())
                        .build());
    }

    PersonaHttpCreationAdapter(
            PersonaGenerationProperties properties,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.objectMapper = Objects.requireNonNull(
                objectMapper, "objectMapper");
        this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
        String baseUrl = requireText(properties.getBaseUrl(), "baseUrl");
        this.endpoint = URI.create(baseUrl.endsWith("/")
                        ? baseUrl
                        : baseUrl + "/")
                .resolve(CREATE_PATH);
    }

    @Override
    public PersonaCreationResult create(PersonaCreationCommand command) {
        Objects.requireNonNull(command, "command");
        HttpRequest request = request(command);
        try {
            HttpResponse<String> response = httpClient.send(
                    request, HttpResponse.BodyHandlers.ofString());
            return handleResponse(command, response);
        } catch (HttpTimeoutException exception) {
            throw failure(
                    PersonaCreationErrorCode.TIMEOUT,
                    true,
                    "persona creation request timed out",
                    exception);
        } catch (IOException exception) {
            throw failure(
                    PersonaCreationErrorCode.NETWORK_ERROR,
                    true,
                    "persona creation network error",
                    exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(
                    PersonaCreationErrorCode.NETWORK_ERROR,
                    true,
                    "persona creation request interrupted",
                    exception);
        }
    }

    private HttpRequest request(PersonaCreationCommand command) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(endpoint)
                    .timeout(properties.getRequestTimeout())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            command.requestPayload()));
            String authToken = properties.getAuthToken();
            if (authToken != null && !authToken.isBlank()) {
                builder.header("Authorization", "Bearer " + authToken);
            }
            return builder.build();
        } catch (RuntimeException exception) {
            throw failure(
                    PersonaCreationErrorCode.INVALID_RESPONSE,
                    false,
                    "persona creation request could not be encoded",
                    exception);
        }
    }

    private PersonaCreationResult handleResponse(
            PersonaCreationCommand command,
            HttpResponse<String> response
    ) {
        int status = response.statusCode();
        if (status == 200 || status == 201) {
            return decodeSuccess(command, response.body());
        }
        if (status == 409 && "IDEMPOTENCY_CONFLICT".equals(
                decodeErrorCode(response.body()))) {
            throw failure(
                    PersonaCreationErrorCode.IDEMPOTENCY_CONFLICT,
                    false,
                    "persona creation idempotency conflict");
        }
        if (status == 408) {
            throw failure(
                    PersonaCreationErrorCode.TIMEOUT,
                    true,
                    "persona creation remote request timed out");
        }
        if (status == 429) {
            throw failure(
                    PersonaCreationErrorCode.RATE_LIMITED,
                    true,
                    "persona creation rate limited");
        }
        if (status >= 500) {
            throw failure(
                    PersonaCreationErrorCode.SERVER_ERROR,
                    true,
                    "persona creation server error");
        }
        throw failure(
                PersonaCreationErrorCode.CLIENT_ERROR,
                false,
                "persona creation rejected by remote server");
    }

    private String decodeErrorCode(String responseBody) {
        try {
            return objectMapper.readValue(
                    responseBody, RemoteErrorResponse.class).code();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private PersonaCreationResult decodeSuccess(
            PersonaCreationCommand command,
            String responseBody
    ) {
        try {
            CreatePersonaResponse response = objectMapper.readValue(
                    responseBody, CreatePersonaResponse.class);
            if (response.generationId() == null
                    || !response.generationId().equals(
                    command.generationId().value())) {
                throw failure(
                        PersonaCreationErrorCode.GENERATION_ID_MISMATCH,
                        false,
                        "persona response generationId does not match");
            }
            return new PersonaCreationResult(
                    new PersonaGenerationId(response.generationId()),
                    new PersonaId(response.personaId()));
        } catch (PersonaCreationException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure(
                    PersonaCreationErrorCode.INVALID_RESPONSE,
                    false,
                    "persona creation response is invalid",
                    exception);
        }
    }

    private static PersonaCreationException failure(
            PersonaCreationErrorCode code,
            boolean retryable,
            String message
    ) {
        return new PersonaCreationException(code, retryable, message);
    }

    private static PersonaCreationException failure(
            PersonaCreationErrorCode code,
            boolean retryable,
            String message,
            Throwable cause
    ) {
        return new PersonaCreationException(
                code, retryable, message, cause);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return value;
    }

    record CreatePersonaResponse(
            UUID generationId,
            String personaId
    ) {
    }

    record RemoteErrorResponse(String code) {
    }
}
