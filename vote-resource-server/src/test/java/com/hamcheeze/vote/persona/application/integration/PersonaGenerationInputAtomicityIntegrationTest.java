package com.hamcheeze.vote.persona.application.integration;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaInboxRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles({"local", "test"})
@Import(TestcontainersConfiguration.class)
class PersonaGenerationInputAtomicityIntegrationTest {

    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-20T01:00:00Z");

    @Autowired
    private PersonaSurveyResponseSubmittedConsumer consumer;

    @MockitoSpyBean
    private PersonaInboxRepository inbox;

    @MockitoSpyBean
    private PersonaGenerationRepository generations;

    @MockitoSpyBean
    private PersonaGenerationInputRepository inputs;

    @MockitoBean
    private PersonaSurveySourceQueryPort sources;

    @MockitoBean
    private UserTransactionLock userTransactions;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    @AfterEach
    void resetDatabase() {
        jdbcTemplate.execute("""
                TRUNCATE TABLE
                    persona_generation_retry_requests,
                    persona_generation_attempts,
                    persona_versions,
                    persona_generation_inputs,
                    persona_generations,
                    persona_inbox
                CASCADE
                """);
    }

    @Test
    void inputInsertFailureRollsBackInboxGenerationAndInput() throws Exception {
        IntegrationEventEnvelope event = arrangeSource();
        doThrow(new IllegalStateException("forced input failure"))
                .when(inputs).insert(any());

        assertThatThrownBy(() -> consumer.consume(event))
                .hasRootCauseMessage("forced input failure");

        assertAllAtomicRowsAbsent();
    }

    @Test
    void generationInsertFailureLeavesNeitherInboxNorInput() throws Exception {
        IntegrationEventEnvelope event = arrangeSource();
        doThrow(new IllegalStateException("forced generation failure"))
                .when(generations).insert(any());

        assertThatThrownBy(() -> consumer.consume(event))
                .hasRootCauseMessage("forced generation failure");

        assertAllAtomicRowsAbsent();
    }

    @Test
    void inboxFailureCreatesNeitherGenerationNorInput() throws Exception {
        IntegrationEventEnvelope event = arrangeSource();
        doThrow(new IllegalStateException("forced inbox failure"))
                .when(inbox).recordIfAbsent(any());

        assertThatThrownBy(() -> consumer.consume(event))
                .hasRootCauseMessage("forced inbox failure");

        assertAllAtomicRowsAbsent();
    }

    private IntegrationEventEnvelope arrangeSource() throws Exception {
        SurveyResponseSubmittedV1 payload = new SurveyResponseSubmittedV1(
                "user-atomic", UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), SUBMITTED_AT);
        when(sources.getByResponseId(
                new PersonaSourceId(payload.responseId())))
                .thenReturn(new PersonaSurveySource(
                        new PersonaSourceId(payload.responseId()),
                        new PersonaUserId(payload.userId()),
                        payload.roundId(), 1,
                        payload.contentVersionId(), 1,
                        payload.submittedAt(), List.of()));
        return new IntegrationEventEnvelope(
                UUID.randomUUID(),
                SurveyResponseSubmittedV1.EVENT_TYPE,
                SurveyResponseSubmittedV1.SCHEMA_VERSION,
                SUBMITTED_AT,
                SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                payload.responseId(),
                objectMapper.writeValueAsString(payload));
    }

    private void assertAllAtomicRowsAbsent() {
        assertThat(count("persona_inbox")).isZero();
        assertThat(count("persona_generations")).isZero();
        assertThat(count("persona_generation_inputs")).isZero();
    }

    private long count(String table) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM " + table, Long.class);
    }
}
