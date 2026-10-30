package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaCreationCommand;
import com.hamcheeze.vote.persona.application.PersonaCreationErrorCode;
import com.hamcheeze.vote.persona.application.PersonaCreationException;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
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
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
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
        assertThat(requestBody.get()).isEqualTo(command.requestPayload());
        assertThat(requestBody.get())
                .contains("OTHER", "직접 입력", "세부 성향", "창작")
                .doesNotContain("user-a", "userId");
    }

    @Test
    void recoversLostResponseWithSameRequestAndReplayedOkResult() {
        AtomicInteger calls = new AtomicInteger();
        List<String> bodies = new CopyOnWriteArrayList<>();
        server.createContext("/v1/personas", exchange -> {
            String body = readBody(exchange);
            bodies.add(body);
            if (calls.getAndIncrement() == 0) {
                exchange.close();
                return;
            }
            respond(exchange, 200, """
                    {"generationId":"%s","personaId":"persona-42"}
                    """.formatted(generationId(body)));
        });
        PersonaCreationCommand command = command();

        assertFailure(
                () -> adapter().create(command),
                PersonaCreationErrorCode.NETWORK_ERROR,
                true);
        var replayed = adapter().create(command);

        assertThat(replayed.generationId()).isEqualTo(command.generationId());
        assertThat(replayed.personaId().value()).isEqualTo("persona-42");
        assertThat(bodies).hasSize(2);
        assertThat(bodies.get(1)).isEqualTo(bodies.get(0));
        assertThat(generationId(bodies.get(1)))
                .isEqualTo(command.generationId().value());
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

    @Test
    void classifiesRateLimitAsRetryableAndUsesStructuredConflictCode() {
        server.createContext("/v1/personas", exchange -> respond(
                exchange, 408, "{}"));
        assertFailure(
                () -> adapter().create(command()),
                PersonaCreationErrorCode.TIMEOUT,
                true);

        server.removeContext("/v1/personas");
        server.createContext("/v1/personas", exchange -> respond(
                exchange, 429, "{}"));
        assertFailure(
                () -> adapter().create(command()),
                PersonaCreationErrorCode.RATE_LIMITED,
                true);

        server.removeContext("/v1/personas");
        server.createContext("/v1/personas", exchange -> respond(
                exchange, 409,
                "{\"code\":\"OTHER_CONFLICT\","
                        + "\"detail\":\"IDEMPOTENCY_CONFLICT\"}"));
        assertFailure(
                () -> adapter().create(command()),
                PersonaCreationErrorCode.CLIENT_ERROR,
                false);
    }

    private PersonaHttpCreationAdapter adapter() {
        return new PersonaHttpCreationAdapter(
                properties, new ObjectMapper());
    }

    private static PersonaCreationCommand command() {
        PersonaSurveySource.PersonaSurveyOption other =
                new PersonaSurveySource.PersonaSurveyOption(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        PersonaSurveySource.OptionKind.OTHER,
                        "직접 입력",
                        1,
                        Optional.of("창작"));
        PersonaSurveySource.PersonaSurveyQuestion question =
                new PersonaSurveySource.PersonaSurveyQuestion(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        PersonaSurveySource.QuestionType.MULTIPLE_CHOICE,
                        "세부 성향",
                        Optional.of("복수 선택"),
                        1);
        PersonaSurveySource source = new PersonaSurveySource(
                new PersonaSourceId(UUID.randomUUID()),
                new PersonaUserId("user-a"),
                UUID.randomUUID(),
                1,
                UUID.randomUUID(),
                1,
                Instant.parse("2026-08-14T00:00:00Z"),
                List.of(new PersonaSurveySource.PersonaSurveyAnswer(
                        question,
                        Optional.of(new PersonaSurveySource.MultipleChoiceValue(
                                List.of(other))))));
        PersonaGenerationId generationId =
                new PersonaGenerationId(UUID.randomUUID());
        var input = new PersonaGenerationInputSnapshotFactoryAdapter(
                new ObjectMapper()).create(
                        generationId, source, Instant.EPOCH);
        return new PersonaCreationCommand(
                generationId,
                input.requestSchemaVersion(),
                input.requestPayload(),
                input.requestFingerprint());
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
