package com.hamcheeze.vote.persona.application.integration;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.PersonaGenerationInputSnapshot;
import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaInboxRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.domain.PersonaGeneration;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.persona.domain.common.PersonaUserId;
import com.hamcheeze.vote.shared.application.UserTransactionLock;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
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
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
                    persona_generation_inputs,
                    persona_generations,
                    persona_inbox
                CASCADE
                """);
    }

    @Test
    void inputInsertFailureRollsBackInboxGenerationAndInput() throws Exception {
        IntegrationEventEnvelope event = arrangeSource().event();
        doThrow(new IllegalStateException("forced input failure"))
                .when(inputs).insert(any());

        assertThatThrownBy(() -> consumer.consume(event))
                .hasRootCauseMessage("forced input failure");

        assertAllAtomicRowsAbsent();
    }

    @Test
    void generationInsertFailureLeavesNeitherInboxNorInput() throws Exception {
        IntegrationEventEnvelope event = arrangeSource().event();
        doThrow(new IllegalStateException("forced generation failure"))
                .when(generations).insert(any());

        assertThatThrownBy(() -> consumer.consume(event))
                .hasRootCauseMessage("forced generation failure");

        assertAllAtomicRowsAbsent();
    }

    @Test
    void inboxFailureCreatesNeitherGenerationNorInput() throws Exception {
        IntegrationEventEnvelope event = arrangeSource().event();
        doThrow(new IllegalStateException("forced inbox failure"))
                .when(inbox).recordIfAbsent(any());

        assertThatThrownBy(() -> consumer.consume(event))
                .hasRootCauseMessage("forced inbox failure");

        assertAllAtomicRowsAbsent();
    }

    @Test
    void existingGenerationWithoutInputRollsBackNewInboxReceipt()
            throws Exception {
        Fixture fixture = arrangeSource();
        PersonaGeneration generation = generations.insert(
                PersonaGeneration.pending(
                        new PersonaGenerationId(UUID.randomUUID()),
                        PersonaSourceType.SURVEY_RESPONSE,
                        fixture.source().responseId(),
                        fixture.source().submittedAt()));
        clearInvocations(generations, inputs);

        assertThatThrownBy(() -> consumer.consume(fixture.event()))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> {
                            assertThat(exception.errorCode()).isEqualTo(
                                    "PERSONA_GENERATION_INPUT_INVARIANT_VIOLATION");
                            assertThat(exception.retryable()).isFalse();
                        });

        assertThat(count("persona_inbox")).isZero();
        assertThat(count("persona_generations")).isEqualTo(1);
        assertThat(count("persona_generation_inputs")).isZero();
        assertThat(generations.findById(generation.id())).isPresent();
        verify(generations, never()).insert(any());
        verify(inputs, never()).insert(any());
    }

    @Test
    void existingInputMetadataMismatchRollsBackInboxWithoutOverwrite()
            throws Exception {
        Fixture fixture = arrangeSource();
        PersonaGeneration generation = generations.insert(
                PersonaGeneration.pending(
                        new PersonaGenerationId(UUID.randomUUID()),
                        PersonaSourceType.SURVEY_RESPONSE,
                        fixture.source().responseId(),
                        fixture.source().submittedAt()));
        inputs.insert(PersonaGenerationInputSnapshot.create(
                generation.id(),
                generation.sourceId(),
                new PersonaUserId("different-user"),
                1,
                "{\"generationId\":\"" + generation.id().value() + "\"}",
                SUBMITTED_AT));
        clearInvocations(generations, inputs);

        assertThatThrownBy(() -> consumer.consume(fixture.event()))
                .isInstanceOfSatisfying(
                        IntegrationEventConsumptionException.class,
                        exception -> assertThat(exception.errorCode())
                                .isEqualTo(
                                        "PERSONA_GENERATION_INPUT_INVARIANT_VIOLATION"));

        assertThat(count("persona_inbox")).isZero();
        assertThat(count("persona_generations")).isEqualTo(1);
        assertThat(count("persona_generation_inputs")).isEqualTo(1);
        assertThat(inputs.findByGenerationId(generation.id()))
                .get()
                .extracting(input -> input.userId().value())
                .isEqualTo("different-user");
        verify(generations, never()).insert(any());
        verify(inputs, never()).insert(any());
    }

    private Fixture arrangeSource() throws Exception {
        SurveyResponseSubmittedV1 payload = new SurveyResponseSubmittedV1(
                "user-atomic", UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), SUBMITTED_AT);
        PersonaSurveySource source = new PersonaSurveySource(
                new PersonaSourceId(payload.responseId()),
                new PersonaUserId(payload.userId()),
                payload.roundId(), 1,
                payload.contentVersionId(), 1,
                payload.submittedAt(), List.of());
        when(sources.getByResponseId(
                new PersonaSourceId(payload.responseId())))
                .thenReturn(source);
        IntegrationEventEnvelope event = new IntegrationEventEnvelope(
                UUID.randomUUID(),
                SurveyResponseSubmittedV1.EVENT_TYPE,
                SurveyResponseSubmittedV1.SCHEMA_VERSION,
                SUBMITTED_AT,
                SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                payload.responseId(),
                objectMapper.writeValueAsString(payload));
        return new Fixture(event, source);
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

    private record Fixture(
            IntegrationEventEnvelope event,
            PersonaSurveySource source
    ) {
    }
}
