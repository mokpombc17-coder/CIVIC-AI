package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.security.VoteScopes;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseSubmittedReplayAuditRepository;
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
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties =
        "vote.security.local-admin-api-enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles({"local", "test"})
class SurveyResponseSubmittedReplayApiIntegrationTest {

    private static final Instant OCCURRED_AT =
            Instant.parse("2026-08-20T00:00:00Z");
    private static final String SECRET_PAYLOAD =
            "sensitive-payload-must-not-leak";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private IntegrationOutboxRepository outbox;

    @Autowired
    private SurveyResponseSubmittedReplayAuditRepository audits;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void resetOutbox() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    survey_response_submitted_replays,
                    integration_outbox
                CASCADE
                """);
    }

    @AfterEach
    void cleanOutbox() {
        resetOutbox();
    }

    @Test
    void createsReplayFromAuthenticatedOperatorAndReusesFirstAudit()
            throws Exception {
        UUID eventId = insertSurveyEvent(OutboxState.DEAD_LETTER);
        String firstReason = "AI 처리 장애가 복구되었습니다.";

        mockMvc.perform(post(replayPath(eventId))
                        .with(operator("operator-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "reason", "  " + firstReason + "  ",
                                "requestedBy", "client-forged-user"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.originalEventId")
                        .value(eventId.toString()))
                .andExpect(jsonPath("$.created").value(true))
                .andExpect(jsonPath("$.requestedBy")
                        .value("operator-a"))
                .andExpect(jsonPath("$.reason").value(firstReason));

        var firstAudit = audits.findByOriginalEventId(eventId).orElseThrow();
        assertThat(firstAudit.requestedBy()).isEqualTo("operator-a");
        assertThat(firstAudit.reason()).isEqualTo(firstReason);
        assertThat(outbox.findByEventId(firstAudit.replayEventId()))
                .isPresent();

        mockMvc.perform(post(replayPath(eventId))
                        .with(operator("operator-b"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "reason", "후속 요청의 다른 사유"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.originalEventId")
                        .value(eventId.toString()))
                .andExpect(jsonPath("$.replayEventId")
                        .value(firstAudit.replayEventId().toString()))
                .andExpect(jsonPath("$.created").value(false))
                .andExpect(jsonPath("$.requestedBy")
                        .value("operator-a"))
                .andExpect(jsonPath("$.requestedAt")
                        .value(firstAudit.requestedAt().toString()))
                .andExpect(jsonPath("$.reason").value(firstReason));

        assertThat(audits.findByOriginalEventId(eventId)).contains(firstAudit);
        assertThat(count("integration_outbox")).isEqualTo(2);
        assertThat(count("survey_response_submitted_replays")).isEqualTo(1);
    }

    @Test
    void mapsReplayApplicationErrorsToNotFoundAndConflict()
            throws Exception {
        UUID missing = UUID.randomUUID();
        mockMvc.perform(post(replayPath(missing))
                        .with(operator("operator-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(
                        "SURVEY_RESPONSE_SUBMITTED_EVENT_NOT_FOUND"))
                .andExpect(jsonPath("$.instance")
                        .value(replayPath(missing)));

        UUID wrongType = insertOtherDeadLetterEvent();
        mockMvc.perform(post(replayPath(wrongType))
                        .with(operator("operator-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(
                        "SURVEY_RESPONSE_SUBMITTED_EVENT_TYPE_REQUIRED"))
                .andExpect(content().string(not(containsString(
                        SECRET_PAYLOAD))))
                .andExpect(content().string(not(containsString(
                        "stackTrace"))))
                .andExpect(content().string(not(containsString("SELECT "))));

        UUID pending = insertSurveyEvent(OutboxState.PENDING);
        mockMvc.perform(post(replayPath(pending))
                        .with(operator("operator-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(
                        "SURVEY_RESPONSE_SUBMITTED_DEAD_LETTER_REQUIRED"))
                .andExpect(jsonPath("$.detail", containsString("PENDING")));

        UUID delivered = insertSurveyEvent(OutboxState.DELIVERED);
        mockMvc.perform(post(replayPath(delivered))
                        .with(operator("operator-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(
                        "SURVEY_RESPONSE_SUBMITTED_DEAD_LETTER_REQUIRED"))
                .andExpect(jsonPath("$.detail", containsString("DELIVERED")));
    }

    @Test
    void rejectsInvalidReasonAndMalformedEventId() throws Exception {
        UUID eventId = insertSurveyEvent(OutboxState.DEAD_LETTER);
        List<String> invalidBodies = List.of(
                "{\"reason\":null}",
                reason(""),
                reason("   "),
                reason("가".repeat(1001)));

        for (String invalidBody : invalidBodies) {
            mockMvc.perform(post(replayPath(eventId))
                            .with(operator("operator-a"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(invalidBody))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code")
                            .value("INVALID_REQUEST"));
        }

        mockMvc.perform(post(
                        "/api/v1/operations/survey/outbox-events/not-a-uuid/replays")
                        .with(operator("operator-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        String maximumReason = "가".repeat(1000);
        mockMvc.perform(post(replayPath(eventId))
                        .with(operator("operator-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("  " + maximumReason + "  ")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reason").value(maximumReason));
    }

    @Test
    void requiresDedicatedOperationsScopeEvenWhenLocalAdminIsEnabled()
            throws Exception {
        UUID eventId = insertSurveyEvent(OutboxState.DEAD_LETTER);

        mockMvc.perform(post(replayPath(eventId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));

        for (String userScope : List.of(
                VoteScopes.SURVEYS_READ,
                VoteScopes.SURVEY_RESPONSES_WRITE,
                VoteScopes.PERSONAS_READ)) {
            mockMvc.perform(post(replayPath(eventId))
                            .with(scopedJwt("user-a", userScope))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(reason("복구")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }

        mockMvc.perform(post(replayPath(eventId))
                        .with(operator("operator-a"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("복구")))
                .andExpect(status().isCreated());
    }

    @Test
    void concurrentApiRequestsConvergeOnOneReplay() throws Exception {
        UUID eventId = insertSurveyEvent(OutboxState.DEAD_LETTER);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<MvcResult> first = executor.submit(() -> {
                start.await();
                return replay(eventId, "operator-a");
            });
            Future<MvcResult> second = executor.submit(() -> {
                start.await();
                return replay(eventId, "operator-b");
            });
            start.countDown();

            List<MvcResult> results = List.of(first.get(), second.get());
            assertThat(results)
                    .extracting(result -> result.getResponse().getStatus())
                    .containsExactlyInAnyOrder(201, 200);
            assertThat(results)
                    .extracting(result -> objectMapper.readTree(
                                    result.getResponse().getContentAsString())
                            .get("replayEventId").asText())
                    .allMatch(replayEventId -> replayEventId.equals(
                            audits.findByOriginalEventId(eventId)
                                    .orElseThrow()
                                    .replayEventId()
                                    .toString()));
        }
        assertThat(count("integration_outbox")).isEqualTo(2);
        assertThat(count("survey_response_submitted_replays")).isEqualTo(1);
    }

    private MvcResult replay(UUID eventId, String subject) throws Exception {
        return mockMvc.perform(post(replayPath(eventId))
                        .with(operator(subject))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reason("동시 복구")))
                .andReturn();
    }

    private UUID insertSurveyEvent(OutboxState state) throws Exception {
        UUID eventId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        SurveyResponseSubmittedV1 payload = new SurveyResponseSubmittedV1(
                "survey-user",
                responseId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                OCCURRED_AT);
        IntegrationEventEnvelope event = new IntegrationEventEnvelope(
                eventId,
                SurveyResponseSubmittedV1.EVENT_TYPE,
                SurveyResponseSubmittedV1.SCHEMA_VERSION,
                OCCURRED_AT,
                SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                responseId,
                objectMapper.writeValueAsString(payload));
        outbox.insert(state.apply(
                IntegrationOutboxMessage.pending(event, OCCURRED_AT)));
        return eventId;
    }

    private UUID insertOtherDeadLetterEvent() {
        UUID eventId = UUID.randomUUID();
        IntegrationEventEnvelope event = new IntegrationEventEnvelope(
                eventId,
                "task.unrelated-event",
                1,
                OCCURRED_AT,
                "TASK",
                UUID.randomUUID(),
                "{\"secret\":\"" + SECRET_PAYLOAD + "\"}");
        outbox.insert(OutboxState.DEAD_LETTER.apply(
                IntegrationOutboxMessage.pending(event, OCCURRED_AT)));
        return eventId;
    }

    private String reason(String reason) throws Exception {
        return objectMapper.writeValueAsString(Map.of("reason", reason));
    }

    private static String replayPath(UUID eventId) {
        return "/api/v1/operations/survey/outbox-events/"
                + eventId + "/replays";
    }

    private static RequestPostProcessor operator(String subject) {
        return scopedJwt(subject, VoteScopes.SURVEY_OUTBOX_REPLAYS_WRITE);
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

    private int count(String table) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM " + table,
                Integer.class);
    }

    private enum OutboxState {
        PENDING {
            @Override
            IntegrationOutboxMessage apply(
                    IntegrationOutboxMessage message
            ) {
                return message;
            }
        },
        DELIVERED {
            @Override
            IntegrationOutboxMessage apply(
                    IntegrationOutboxMessage message
            ) {
                return message.markPublished(OCCURRED_AT.plusSeconds(1));
            }
        },
        DEAD_LETTER {
            @Override
            IntegrationOutboxMessage apply(
                    IntegrationOutboxMessage message
            ) {
                return message.recordFailure(
                        "PERSONA_TEMPORARY_FAILURE: fixture",
                        OCCURRED_AT.plusSeconds(1),
                        null);
            }
        };

        abstract IntegrationOutboxMessage apply(
                IntegrationOutboxMessage message);
    }
}
