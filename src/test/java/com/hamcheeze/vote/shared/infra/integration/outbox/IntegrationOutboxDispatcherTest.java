package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxDeliveryException;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IntegrationOutboxDispatcherTest {

    private static final Instant NOW =
            Instant.parse("2026-08-18T00:00:00Z");

    private final IntegrationOutboxDeliveryService deliveries =
            mock(IntegrationOutboxDeliveryService.class);
    private final IntegrationOutboxProperties properties = properties();
    private final IntegrationOutboxDispatcher dispatcher =
            new IntegrationOutboxDispatcher(deliveries, properties);

    @Test
    void stopsWhenNoReadyEventRemains() {
        when(deliveries.deliverNext()).thenReturn(true, false);

        assertThat(dispatcher.dispatchAvailable()).isEqualTo(1);
    }

    @Test
    void recordsFailureAndContinuesBatch() {
        IntegrationOutboxMessage message = pending();
        IntegrationOutboxDeliveryException failure =
                new IntegrationOutboxDeliveryException(
                        message.event().eventId(),
                        "TEMPORARY",
                        true,
                        "failed",
                        new IllegalStateException("temporary"));
        IntegrationOutboxMessage failed = message.recordFailure(
                "TEMPORARY", NOW, NOW.plusSeconds(1));
        when(deliveries.deliverNext()).thenThrow(failure).thenReturn(false);
        when(deliveries.recordFailure(failure)).thenReturn(failed);

        assertThat(dispatcher.dispatchAvailable()).isEqualTo(1);
        verify(deliveries).recordFailure(failure);
    }

    private static IntegrationOutboxProperties properties() {
        IntegrationOutboxProperties result = new IntegrationOutboxProperties();
        result.setBatchSize(2);
        return result;
    }

    private static IntegrationOutboxMessage pending() {
        return IntegrationOutboxMessage.pending(
                new IntegrationEventEnvelope(
                        UUID.randomUUID(),
                        "survey.response-submitted",
                        1,
                        NOW,
                        "SURVEY_RESPONSE",
                        UUID.randomUUID(),
                        "{}"),
                NOW);
    }
}
