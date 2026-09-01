package com.hamcheeze.vote.persona.application.integration;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaGenerationInputRepository;
import com.hamcheeze.vote.persona.application.port.out.PersonaInboxRepository;
import com.hamcheeze.vote.persona.domain.PersonaGenerationStatus;
import com.hamcheeze.vote.persona.domain.PersonaSourceType;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import com.hamcheeze.vote.shared.infra.integration.outbox.IntegrationOutboxDeliveryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class PersonaSurveyResponseSubmittedConsumerIntegrationTest {

    private static final Instant SUBMITTED_AT =
            Instant.parse("2026-08-18T00:00:00.123456Z");

    @Autowired
    private PersonaSurveyResponseSubmittedConsumer consumer;

    @Autowired
    private PersonaGenerationRepository generations;

    @Autowired
    private PersonaGenerationInputRepository inputs;

    @Autowired
    private PersonaInboxRepository inbox;

    @Autowired
    private IntegrationOutboxRepository outbox;

    @Autowired
    private IntegrationOutboxDeliveryService deliveries;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void consumesAtLeastOnceDeliveryIntoOneGeneration() throws Exception {
        SurveyResponseSubmittedV1 payload = insertSurveyResponse("user-a");
        UUID firstEventId = UUID.randomUUID();
        IntegrationEventEnvelope firstEvent = event(firstEventId, payload);

        consumer.consume(firstEvent);

        PersonaSourceId sourceId = new PersonaSourceId(payload.responseId());
        var firstGeneration = generations.findBySource(
                        PersonaSourceType.SURVEY_RESPONSE, sourceId)
                .orElseThrow();
        assertThat(firstGeneration.status())
                .isEqualTo(PersonaGenerationStatus.PENDING);
        assertThat(firstGeneration.createdAt()).isEqualTo(SUBMITTED_AT);
        assertThat(inputs.findByGenerationId(firstGeneration.id()))
                .get()
                .satisfies(input -> {
                    assertThat(input.sourceId()).isEqualTo(sourceId);
                    assertThat(input.userId().value()).isEqualTo("user-a");
                    assertThat(input.requestPayload())
                            .contains(firstGeneration.id().value().toString())
                            .contains("\"textValue\":\"응답\"");
                });
        assertThat(inbox.exists(
                PersonaSurveyResponseSubmittedConsumer.CONSUMER_NAME,
                firstEventId)).isTrue();

        consumer.consume(firstEvent);
        UUID secondEventId = UUID.randomUUID();
        consumer.consume(event(secondEventId, payload));

        assertThat(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE, sourceId))
                .get()
                .extracting(generation -> generation.id())
                .isEqualTo(firstGeneration.id());
        assertThat(inbox.exists(
                PersonaSurveyResponseSubmittedConsumer.CONSUMER_NAME,
                secondEventId)).isTrue();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM persona_generation_inputs",
                Long.class)).isEqualTo(1);
    }

    @Test
    void deliversOutboxEventToPersonaAndMarksItPublished() throws Exception {
        SurveyResponseSubmittedV1 payload = insertSurveyResponse("user-b");
        IntegrationEventEnvelope integrationEvent =
                event(UUID.randomUUID(), payload);
        outbox.insert(IntegrationOutboxMessage.pending(
                integrationEvent,
                payload.submittedAt()));

        assertThat(deliveries.deliverNext()).isTrue();

        assertThat(outbox.findByEventIdForUpdate(integrationEvent.eventId()))
                .get()
                .satisfies(message -> {
                    assertThat(message.published()).isTrue();
                    assertThat(message.deadLettered()).isFalse();
                    assertThat(message.publishedAt()).isNotNull();
                });
        assertThat(generations.findBySource(
                PersonaSourceType.SURVEY_RESPONSE,
                new PersonaSourceId(payload.responseId())))
                .get()
                .satisfies(generation -> assertThat(generation.status())
                        .isEqualTo(PersonaGenerationStatus.PENDING));
        assertThat(inbox.exists(
                PersonaSurveyResponseSubmittedConsumer.CONSUMER_NAME,
                integrationEvent.eventId())).isTrue();
    }

    private IntegrationEventEnvelope event(
            UUID eventId,
            SurveyResponseSubmittedV1 payload
    ) throws Exception {
        return new IntegrationEventEnvelope(
                eventId,
                SurveyResponseSubmittedV1.EVENT_TYPE,
                SurveyResponseSubmittedV1.SCHEMA_VERSION,
                payload.submittedAt(),
                SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                payload.responseId(),
                objectMapper.writeValueAsString(payload));
    }

    private SurveyResponseSubmittedV1 insertSurveyResponse(String userId) {
        UUID contentId = UUID.randomUUID();
        UUID roundId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        UUID questionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_content_versions (
                    content_version_id, version_number, status, row_version,
                    name, created_by, created_at, last_modified_by,
                    last_modified_at, published_by, published_at)
                VALUES (?, ?, 'PUBLISHED', 0, 'fixture', 'admin', ?,
                    'admin', ?, 'admin', ?)
                """, contentId, positiveLong(contentId),
                Timestamp.from(SUBMITTED_AT),
                Timestamp.from(SUBMITTED_AT),
                Timestamp.from(SUBMITTED_AT));
        UUID sectionId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_question_sections (
                    section_id, content_version_id, section_lineage_id,
                    section_key, title, display_order)
                VALUES (?, ?, ?, ?, '섹션', 1)
                """, sectionId, contentId, UUID.randomUUID(),
                "test.section." + sectionId);
        UUID groupId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO survey_question_groups (
                    group_id, content_version_id, group_lineage_id,
                    section_id, group_key, source_number, title, prompt,
                    display_order)
                VALUES (?, ?, ?, ?, ?, '1', '질문', '질문', 1)
                """, groupId, contentId, UUID.randomUUID(),
                sectionId,
                "test.group." + groupId);
        jdbcTemplate.update("""
                INSERT INTO survey_questions (
                    question_id, content_version_id, question_lineage_id,
                    group_id, item_key, item_display_order,
                    type, prompt, display_order, is_required,
                    text_max_length)
                VALUES (?, ?, ?, ?, 'value', 1,
                    'SHORT_TEXT', '질문', 1, true, 200)
                """, questionId, contentId, UUID.randomUUID(), groupId);
        jdbcTemplate.update("""
                INSERT INTO survey_rounds (
                    round_id, round_number, content_version_id, status,
                    enforcement_mode, activated_at, created_by, created_at,
                    row_version)
                VALUES (?, ?, ?, 'ACTIVE', 'REQUIRED', ?, 'admin', ?, 0)
                """, roundId, positiveLong(roundId), contentId,
                Timestamp.from(SUBMITTED_AT),
                Timestamp.from(SUBMITTED_AT));
        jdbcTemplate.update("""
                INSERT INTO survey_responses (
                    response_id, user_id, round_id, content_version_id,
                    submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """, responseId, userId, roundId, contentId,
                Timestamp.from(SUBMITTED_AT));
        jdbcTemplate.update("""
                INSERT INTO survey_answers (
                    answer_id, response_id, content_version_id,
                    question_id, answer_type, text_value)
                VALUES (?, ?, ?, ?, 'SHORT_TEXT', '응답')
                """, UUID.randomUUID(), responseId, contentId, questionId);
        return new SurveyResponseSubmittedV1(
                userId,
                responseId,
                roundId,
                contentId,
                SUBMITTED_AT);
    }

    private static long positiveLong(UUID value) {
        return (value.getLeastSignificantBits() & Long.MAX_VALUE) % 1_000_000
                + 1;
    }
}
