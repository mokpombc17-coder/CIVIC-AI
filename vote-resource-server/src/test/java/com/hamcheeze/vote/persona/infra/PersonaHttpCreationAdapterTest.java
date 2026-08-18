package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaCreationErrorCode;
import com.hamcheeze.vote.persona.application.PersonaCreationException;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundId;
import com.hamcheeze.vote.survey.domain.common.SurveyRoundNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.content.SurveyOptionKind;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;
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
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PersonaHttpCreationAdapterTest {

    private static final Pattern GENERATION_ID = Pattern.compile(
            "\\\"generationId\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");

    private HttpServer server;
    private PersonaGenerationProperties properties;
    private final AtomicReference<String> requestBody =
            new AtomicReference<>();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.start();
        properties = new PersonaGenerationProperties();
        properties.setBaseUrl("http://127.0.0.1:"
                + server.getAddress().getPort());
        properties.setRequestTimeout(Duration.ofSeconds(1));
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void postsLosslessSnapshotWithoutInternalUserIdAndAcceptsCreated()
            throws Exception {
        server.createContext("/v1/personas", exchange -> {
            String body = readBody(exchange);
            requestBody.set(body);
            respond(exchange, 201, """
                    {"generationId":"%s","personaId":"persona-42"}
                    """.formatted(generationId(body)));
        });
        PersonaCreationCommand command = command();

        var result = adapter().create(command);

        assertThat(result.generationId()).isEqualTo(command.generationId());
        assertThat(result.personaId().value()).isEqualTo("persona-42");
        assertThat(requestBody.get())
                .contains("OTHER", "직접 입력", "세부 성향", "창작")
                .doesNotContain("user-a", "userId");
    }

    @Test
    void rejectsMismatchedGenerationIdAndBlankPersonaId() {
        server.createContext("/v1/personas", exchange -> respond(
                exchange, 201, """
                        {"generationId":"%s","personaId":"persona-42"}
                        """.formatted(UUID.randomUUID())));

        assertFailure(
                () -> adapter().create(command()),
                PersonaCreationErrorCode.GENERATION_ID_MISMATCH,
                false);

        server.removeContext("/v1/personas");
        server.createContext("/v1/personas", exchange -> respond(
                exchange, 201, """
                        {"generationId":"%s","personaId":" "}
                        """.formatted(generationId(readBody(exchange)))));

        assertFailure(
                () -> adapter().create(command()),
                PersonaCreationErrorCode.INVALID_RESPONSE,
                false);
    }

    @Test
    void classifiesConflictServerErrorAndTimeout() {
        server.createContext("/v1/personas", exchange -> respond(
                exchange, 409, "{\"code\":\"IDEMPOTENCY_CONFLICT\"}"));
        assertFailure(
                () -> adapter().create(command()),
                PersonaCreationErrorCode.IDEMPOTENCY_CONFLICT,
                false);

        server.removeContext("/v1/personas");
        server.createContext("/v1/personas", exchange -> respond(
                exchange, 503, "{}"));
        assertFailure(
                () -> adapter().create(command()),
                PersonaCreationErrorCode.SERVER_ERROR,
                true);

        server.removeContext("/v1/personas");
        properties.setRequestTimeout(Duration.ofMillis(20));
        server.createContext("/v1/personas", exchange -> {
            try {
                Thread.sleep(100);
                respond(exchange, 201, "{}");
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        });
        assertFailure(
                () -> adapter().create(command()),
                PersonaCreationErrorCode.TIMEOUT,
                true);
    }

    private PersonaHttpCreationAdapter adapter() {
        return new PersonaHttpCreationAdapter(
                properties, new ObjectMapper());
    }

    private static PersonaCreationCommand command() {
        PersonaSurveySource.PersonaSurveyOption other =
                new PersonaSurveySource.PersonaSurveyOption(
                        new SurveyOptionId(UUID.randomUUID()),
                        new SurveyOptionLineageKey(UUID.randomUUID()),
                        SurveyOptionKind.OTHER,
                        "직접 입력",
                        1,
                        Optional.of("창작"));
        PersonaSurveySource.PersonaSurveyQuestion question =
                new PersonaSurveySource.PersonaSurveyQuestion(
                        new SurveyQuestionId(UUID.randomUUID()),
                        new SurveyQuestionLineageKey(UUID.randomUUID()),
                        SurveyQuestionType.MULTIPLE_CHOICE,
                        "세부 성향",
                        Optional.of("복수 선택"),
                        1);
        PersonaSurveySource source = new PersonaSurveySource(
                new SurveyResponseId(UUID.randomUUID()),
                new SurveyUserId("user-a"),
                new SurveyRoundId(UUID.randomUUID()),
                new SurveyRoundNumber(1),
                new SurveyContentVersionId(UUID.randomUUID()),
                new SurveyContentVersionNumber(1),
                Instant.parse("2026-08-14T00:00:00Z"),
                List.of(new PersonaSurveySource.PersonaSurveyAnswer(
                        question,
                        new PersonaSurveySource.MultipleChoiceValue(
                                List.of(other)))));
        return new PersonaCreationCommand(
                new PersonaGenerationId(UUID.randomUUID()), 1, source);
    }

    private String readBody(HttpExchange exchange) throws IOException {
        return new String(
                exchange.getRequestBody().readAllBytes(),
                StandardCharsets.UTF_8);
    }

    private static UUID generationId(String body) {
        Matcher matcher = GENERATION_ID.matcher(body);
        if (!matcher.find()) {
            throw new AssertionError("generationId missing from request");
        }
        return UUID.fromString(matcher.group(1));
    }

    private static void respond(
            HttpExchange exchange,
            int status,
            String body
    ) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add(
                "Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void assertFailure(
            Runnable action,
            PersonaCreationErrorCode code,
            boolean retryable
    ) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(
                        PersonaCreationException.class,
                        exception -> {
                            assertThat(exception.errorCode()).isEqualTo(code);
                            assertThat(exception.retryable())
                                    .isEqualTo(retryable);
                        });
    }
}
