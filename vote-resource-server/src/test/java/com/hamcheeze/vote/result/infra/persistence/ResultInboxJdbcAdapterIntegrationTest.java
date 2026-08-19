package com.hamcheeze.vote.result.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.result.application.integration.ResultInboxReceipt;
import com.hamcheeze.vote.result.application.port.out.ResultInboxRepository;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.task.TaskSubmissionCompletedV1;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class ResultInboxJdbcAdapterIntegrationTest {

    private static final Instant OCCURRED_AT =
            Instant.parse("2026-08-19T00:00:00.123456Z");
    private static final Instant PROCESSED_AT =
            Instant.parse("2026-08-19T00:01:00.654321Z");

    @Autowired
    private ResultInboxRepository inbox;

    @Test
    void storesExactEnvelopeOncePerConsumer() {
        UUID eventId = UUID.randomUUID();
        String payload = "{\"submissionId\":\"" + uuid(2) + "\"}";
        IntegrationEventEnvelope event = new IntegrationEventEnvelope(
                eventId,
                TaskSubmissionCompletedV1.EVENT_TYPE,
                TaskSubmissionCompletedV1.SCHEMA_VERSION,
                OCCURRED_AT,
                TaskSubmissionCompletedV1.AGGREGATE_TYPE,
                uuid(2),
                payload);
        ResultInboxReceipt receipt = ResultInboxReceipt.from(
                "result-consumer", event, PROCESSED_AT);

        assertThat(inbox.recordIfAbsent(receipt)).isTrue();
        assertThat(inbox.recordIfAbsent(receipt)).isFalse();
        assertThat(inbox.find("result-consumer", eventId))
                .contains(receipt)
                .get()
                .extracting(ResultInboxReceipt::payload)
                .isEqualTo(payload);
        assertThat(inbox.recordIfAbsent(ResultInboxReceipt.from(
                "result-audit", event, PROCESSED_AT))).isTrue();
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "130e0000-0000-0000-0000-%012d".formatted(suffix));
    }
}
