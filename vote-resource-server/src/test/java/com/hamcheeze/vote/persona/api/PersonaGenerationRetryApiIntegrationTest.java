package com.hamcheeze.vote.persona.api;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRetryRequestRepository;
import com.hamcheeze.vote.persona.application.PersonaGenerationRetryService;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationClaimToken;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.security.VoteScopes;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "vote.security.local-admin-api-enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles({"local", "test"})
class PersonaGenerationRetryApiIntegrationTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-08-20T00:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockitoSpyBean
    private PersonaGenerationRepository generations;

    @MockitoSpyBean
    private PersonaGenerationRetryRequestRepository retryRequests;

    @Autowired
    private PersonaGenerationRetryService retryService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    @AfterEach
    void reset() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    persona_generation_retry_requests,
                    persona_generation_attempts,
                    persona_versions,
                    persona_generations
                CASCADE
                """);
    }

    @Test
    void createsAndIdempotentlyReturnsRetryFromAuthenticatedOperator()
            throws Exception {
        PersonaGeneration generation = terminalFailure();
        String key = "persona-retry-key-1";
        String reason = "AI provider 장애가 복구되었습니다.";

        MvcResult first = mockMvc.perform(post(path(generation.id()))
                        .with(operator("operator-a"))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "reason", "  " + reason + "  ",
                                "requestedBy", "forged-user"))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.created").value(true))
                .andExpect(jsonPath("$.generationId").value(
                        generation.id().value().toString()))
                .andExpect(jsonPath("$.requestedBy").value("operator-a"))
                .andExpect(jsonPath("$.reason").value(reason))
                .andReturn();
        String retryRequestId = objectMapper.readTree(
                        first.getResponse().getContentAsString())
                .get("retryRequestId").asText();

        mockMvc.perform(post(path(generation.id()))
                        .with(operator("operator-b"))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("다른 후속 사유")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(
                        "PERSONA_GENERATION_RETRY_IDEMPOTENCY_CONFLICT"));

        mockMvc.perform(post(path(generation.id()))
                        .with(operator("operator-b"))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason(reason)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(false))
                .andExpect(jsonPath("$.retryRequestId")
                        .value(retryRequestId))
                .andExpect(jsonPath("$.requestedBy").value("operator-a"))
                .andExpect(jsonPath("$.reason").value(reason));

        assertThat(count("persona_generation_retry_requests")).isEqualTo(1);
        assertThat(generations.findById(generation.id()).orElseThrow()
                .attemptCount()).isEqualTo(1);
        assertThat(generations.findById(generation.id()).orElseThrow()
                .nextAttemptAt()).isPresent();
    }

    @Test
    void mapsInvalidStateMissingGenerationAndInvalidRequest() throws Exception {
        PersonaGenerationId missing =
                new PersonaGenerationId(UUID.randomUUID());
        mockMvc.perform(post(path(missing))
                        .with(operator("operator-a"))
                        .header("Idempotency-Key", "key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(
                        "PERSONA_GENERATION_NOT_FOUND"));

        for (PersonaGeneration generation : List.of(
                pending(), processing(), retryScheduled(), succeeded())) {
            mockMvc.perform(post(path(generation.id()))
                            .with(operator("operator-a"))
                            .header("Idempotency-Key", UUID.randomUUID())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(reason("복구")))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value(
                            "PERSONA_GENERATION_TERMINAL_FAILURE_REQUIRED"));
        }

        PersonaGeneration terminal = terminalFailure();
        for (String body : List.of(
                "{\"reason\":null}",
                reason(""),
                reason("   "),
                reason("가".repeat(1001)))) {
            mockMvc.perform(post(path(terminal.id()))
                            .with(operator("operator-a"))
                            .header("Idempotency-Key", "key")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
        mockMvc.perform(post(path(terminal.id()))
                        .with(operator("operator-a"))
                        .header("Idempotency-Key", " ")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void requiresDedicatedScopeEvenWhenLocalAdminIsEnabled() throws Exception {
        PersonaGeneration generation = terminalFailure();
        var request = post(path(generation.id()))
                .header("Idempotency-Key", "security-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content(reason("복구"));
        mockMvc.perform(request).andExpect(status().isUnauthorized());

        for (String scope : List.of(
                VoteScopes.SURVEYS_READ,
                VoteScopes.SURVEY_RESPONSES_WRITE,
                VoteScopes.PERSONAS_READ,
                VoteScopes.TASKS_READ,
                VoteScopes.PREDICTIONS_WRITE,
                VoteScopes.SURVEY_OUTBOX_REPLAYS_WRITE)) {
            mockMvc.perform(post(path(generation.id()))
                            .with(scopedJwt("user-a", scope))
                            .header("Idempotency-Key", "security-key")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(reason("복구")))
                    .andExpect(status().isForbidden());
        }

        mockMvc.perform(post(path(generation.id()))
                        .with(operator("operator-a"))
                        .header("Idempotency-Key", "security-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isAccepted());
    }

    @Test
    void concurrentRequestsConvergeOnOneRetry() throws Exception {
        PersonaGeneration generation = terminalFailure();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<MvcResult> first = executor.submit(() -> requestRetry(
                    generation.id(), "concurrent-key", start));
            Future<MvcResult> second = executor.submit(() -> requestRetry(
                    generation.id(), "concurrent-key", start));
            start.countDown();
            List<MvcResult> results = List.of(first.get(), second.get());
            assertThat(results).extracting(result ->
                            result.getResponse().getStatus())
                    .containsExactlyInAnyOrder(202, 200);
            String expectedRetryRequestId = objectMapper.readTree(
                            results.getFirst().getResponse()
                                    .getContentAsString())
                    .get("retryRequestId").asText();
            assertThat(results).extracting(result -> objectMapper.readTree(
                                    result.getResponse().getContentAsString())
                            .get("retryRequestId").asText())
                    .containsOnly(expectedRetryRequestId);
        }
        assertThat(count("persona_generation_retry_requests")).isEqualTo(1);
    }

    @Test
    void auditAndGenerationSchedulingRollBackTogether() {
        PersonaGeneration auditFailure = terminalFailure();
        doThrow(new IllegalStateException("forced audit failure"))
                .when(retryRequests).insert(any());

        assertThatThrownBy(() -> retryService.retry(
                new PersonaGenerationRetryService.RetryCommand(
                        auditFailure.id(), "rollback-audit", "operator-a",
                        "복구")))
                .hasRootCauseMessage("forced audit failure");

        assertThat(generations.findById(auditFailure.id()).orElseThrow()
                .nextAttemptAt()).isEmpty();
        assertThat(count("persona_generation_retry_requests")).isZero();
    }

    @Test
    void generationSaveFailureDoesNotStoreAudit() {
        PersonaGeneration generationFailure = terminalFailure();
        doThrow(new IllegalStateException("forced generation failure"))
                .when(generations).save(any());

        assertThatThrownBy(() -> retryService.retry(
                new PersonaGenerationRetryService.RetryCommand(
                        generationFailure.id(), "rollback-generation",
                        "operator-a", "복구")))
                .hasRootCauseMessage("forced generation failure");

        assertThat(count("persona_generation_retry_requests")).isZero();
    }

    private MvcResult requestRetry(
            PersonaGenerationId generationId,
            String key,
            CountDownLatch start
    ) throws Exception {
        start.await();
        return mockMvc.perform(post(path(generationId))
                        .with(operator("operator-a"))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("동시 복구")))
                .andReturn();
    }

    private PersonaGeneration terminalFailure() {
        PersonaGeneration generation = pendingGeneration();
        PersonaGenerationClaimToken token = claim(generation);
        generation.fail(token, "TERMINAL", CREATED_AT.plusSeconds(2), null);
        return generations.insert(generation);
    }

    private PersonaGeneration pending() {
        return generations.insert(pendingGeneration());
    }

    private PersonaGeneration processing() {
        PersonaGeneration generation = pendingGeneration();
        claim(generation);
        return generations.insert(generation);
    }

    private PersonaGeneration retryScheduled() {
        PersonaGeneration generation = pendingGeneration();
        PersonaGenerationClaimToken token = claim(generation);
        generation.fail(token, "RETRYABLE", CREATED_AT.plusSeconds(2),
                CREATED_AT.plusSeconds(60));
        return generations.insert(generation);
    }

    private PersonaGeneration succeeded() {
        PersonaGeneration generation = pendingGeneration();
        PersonaGenerationClaimToken token = claim(generation);
        generation.succeed(token, new PersonaId(
                "persona-" + UUID.randomUUID()), CREATED_AT.plusSeconds(2));
        return generations.insert(generation);
    }

    private static PersonaGeneration pendingGeneration() {
        return PersonaGeneration.pending(
                new PersonaGenerationId(UUID.randomUUID()),
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(UUID.randomUUID()),
                CREATED_AT);
    }

    private static PersonaGenerationClaimToken claim(
            PersonaGeneration generation
    ) {
        PersonaGenerationClaimToken token =
                new PersonaGenerationClaimToken(UUID.randomUUID());
        generation.claim(token, CREATED_AT.plusSeconds(1),
                CREATED_AT.plusSeconds(91));
        return token;
    }

    private String reason(String value) throws Exception {
        return objectMapper.writeValueAsString(Map.of("reason", value));
    }

    private long count(String table) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM " + table, Long.class);
    }

    private static String path(PersonaGenerationId generationId) {
        return "/api/v1/operations/persona/generations/"
                + generationId.value() + "/retries";
    }

    private static RequestPostProcessor operator(String subject) {
        return scopedJwt(
                subject, VoteScopes.PERSONA_GENERATION_RETRIES_WRITE);
    }

    private static RequestPostProcessor scopedJwt(
            String subject,
            String scope
    ) {
        return jwt()
                .jwt(token -> token.subject(subject))
                .authorities(new SimpleGrantedAuthority(
                        VoteScopes.authority(scope)));
    }
}
