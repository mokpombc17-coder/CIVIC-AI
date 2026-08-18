package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaCreationErrorCode;
import com.hamcheeze.vote.persona.application.PersonaCreationException;
import com.hamcheeze.vote.persona.application.PersonaCreationResult;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.MultipleChoiceValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.NumberValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyAnswer;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyAnswerValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.PersonaSurveyOption;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.ScaleValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.SingleChoiceValue;
import com.hamcheeze.vote.persona.application.PersonaSurveySource.TextValue;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaModelVersion;
import com.hamcheeze.vote.persona.domain.PredictedAdoptionRate;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Component
@ConditionalOnProperty(
        prefix = "vote.survey.persona",
        name = "provider",
        havingValue = "http",
        matchIfMissing = true)
public class PersonaHttpCreationAdapter implements PersonaCreationPort {

    private static final String CREATE_PATH = "v1/personas";

    private final PersonaGenerationProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI endpoint;

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
                            objectMapper.writeValueAsString(
                                    CreatePersonaRequest.from(command))));
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
        if (status == 201) {
            return decodeSuccess(command, response.body());
        }
        if (status == 409
                && response.body().contains("IDEMPOTENCY_CONFLICT")) {
            throw failure(
                    PersonaCreationErrorCode.IDEMPOTENCY_CONFLICT,
                    false,
                    "persona creation idempotency conflict");
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
                    new PersonaId(response.personaId()),
                    new PredictedAdoptionRate(
                            response.predictedAdoptionRate()),
                    new PersonaModelVersion(response.modelVersion()));
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

    record CreatePersonaRequest(
            UUID generationId,
            int schemaVersion,
            SurveySourcePayload survey
    ) {
        static CreatePersonaRequest from(PersonaCreationCommand command) {
            return new CreatePersonaRequest(
                    command.generationId().value(),
                    command.schemaVersion(),
                    SurveySourcePayload.from(command.source()));
        }
    }

    record SurveySourcePayload(
            UUID responseId,
            UUID roundId,
            int roundNumber,
            UUID contentVersionId,
            int contentVersionNumber,
            Instant submittedAt,
            List<AnswerPayload> answers
    ) {
        static SurveySourcePayload from(PersonaSurveySource source) {
            return new SurveySourcePayload(
                    source.responseId().value(),
                    source.roundId().value(),
                    source.roundNumber().value(),
                    source.contentVersionId().value(),
                    source.contentVersionNumber().value(),
                    source.submittedAt(),
                    source.answers().stream()
                            .map(AnswerPayload::from)
                            .toList());
        }
    }

    record AnswerPayload(
            UUID questionId,
            UUID questionLineageId,
            String questionType,
            String prompt,
            String description,
            int displayOrder,
            ValuePayload value
    ) {
        static AnswerPayload from(PersonaSurveyAnswer answer) {
            var question = answer.question();
            return new AnswerPayload(
                    question.questionId().value(),
                    question.questionLineageId().value(),
                    question.type().name(),
                    question.prompt(),
                    question.description().orElse(null),
                    question.displayOrder(),
                    ValuePayload.from(answer.value()));
        }
    }

    record ValuePayload(
            String type,
            List<OptionPayload> selectedOptions,
            String textValue,
            BigDecimal numberValue,
            Integer scaleValue
    ) {
        static ValuePayload from(PersonaSurveyAnswerValue value) {
            if (value instanceof SingleChoiceValue single) {
                return new ValuePayload(
                        "SINGLE_CHOICE",
                        List.of(OptionPayload.from(
                                single.selectedOption())),
                        null, null, null);
            }
            if (value instanceof MultipleChoiceValue multiple) {
                return new ValuePayload(
                        "MULTIPLE_CHOICE",
                        multiple.selectedOptions().stream()
                                .map(OptionPayload::from)
                                .toList(),
                        null, null, null);
            }
            if (value instanceof TextValue text) {
                return new ValuePayload(
                        "TEXT", List.of(), text.value(), null, null);
            }
            if (value instanceof NumberValue number) {
                return new ValuePayload(
                        "NUMBER", List.of(), null, number.value(), null);
            }
            if (value instanceof ScaleValue scale) {
                return new ValuePayload(
                        "SCALE", List.of(), null, null, scale.value());
            }
            throw new IllegalArgumentException(
                    "unsupported persona survey answer value");
        }
    }

    record OptionPayload(
            UUID optionId,
            UUID optionLineageId,
            String kind,
            String label,
            int displayOrder,
            String inputText
    ) {
        static OptionPayload from(PersonaSurveyOption option) {
            return new OptionPayload(
                    option.optionId().value(),
                    option.optionLineageId().value(),
                    option.kind().name(),
                    option.label(),
                    option.displayOrder(),
                    option.inputText().orElse(null));
        }
    }

    record CreatePersonaResponse(
            UUID generationId,
            String personaId,
            BigDecimal predictedAdoptionRate,
            String modelVersion
    ) {
    }
}
