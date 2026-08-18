package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class IntegrationOutboxJpaAdapterIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-18T00:00:00Z");

    @Autowired
    private IntegrationOutboxRepository outbox;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void preservesPendingIntegrationEventEnvelope() throws Exception {
        UUID eventId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        SurveyResponseSubmittedV1 payload = new SurveyResponseSubmittedV1(
                "user-a",
                responseId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                NOW);
        IntegrationOutboxMessage message = IntegrationOutboxMessage.pending(
                new IntegrationEventEnvelope(
                        eventId,
                        SurveyResponseSubmittedV1.EVENT_TYPE,
                        SurveyResponseSubmittedV1.SCHEMA_VERSION,
                        NOW,
                        SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                        responseId,
                        objectMapper.writeValueAsString(payload)),
                NOW);

        IntegrationOutboxMessage inserted = outbox.insert(message);

        assertThat(outbox.findByEventId(eventId))
                .get()
                .satisfies(restored -> {
                    assertThat(restored.event().eventId()).isEqualTo(eventId);
                    assertThat(restored.event().eventType())
                            .isEqualTo(SurveyResponseSubmittedV1.EVENT_TYPE);
                    assertThat(restored.event().schemaVersion()).isEqualTo(1);
                    assertThat(restored.event().aggregateId())
                            .isEqualTo(responseId);
                    assertThat(restored.event().payload())
                            .contains(
                                    "user-a",
                                    responseId.toString(),
                                    payload.roundId().toString(),
                                    payload.contentVersionId().toString(),
                                    NOW.toString());
                    assertThat(restored.attemptCount()).isZero();
                    assertThat(restored.nextAttemptAt()).isEqualTo(NOW);
                    assertThat(restored.published()).isFalse();
                });
        assertThat(inserted.event().eventId()).isEqualTo(eventId);
    }

    @Test
    void databaseRejectsNonObjectPayload() {
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO integration_outbox (
                    event_id, event_type, schema_version, occurred_at,
                    aggregate_type, aggregate_id, payload, attempt_count,
                    next_attempt_at, created_at)
                VALUES (?, ?, 1, ?, ?, ?, CAST(? AS jsonb), 0, ?, ?)
                """,
                UUID.randomUUID(),
                SurveyResponseSubmittedV1.EVENT_TYPE,
                Timestamp.from(NOW),
                SurveyResponseSubmittedV1.AGGREGATE_TYPE,
                UUID.randomUUID(),
                "[]",
                Timestamp.from(NOW),
                Timestamp.from(NOW)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(
                        "ck_integration_outbox_payload_object");
    }
}
