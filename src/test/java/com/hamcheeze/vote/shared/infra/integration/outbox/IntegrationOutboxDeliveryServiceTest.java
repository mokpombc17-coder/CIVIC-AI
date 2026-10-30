package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.shared.integration.IntegrationEventConsumer;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.IntegrationEventEnvelope;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxDeliveryException;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IntegrationOutboxDeliveryServiceTest {

    private static final Instant NOW =
            Instant.parse("2026-08-18T00:00:00Z");
    private static final String EVENT_TYPE = "survey.response-submitted";

    private final IntegrationOutboxRepository outbox =
            mock(IntegrationOutboxRepository.class);
    private final IntegrationEventConsumer consumer = consumer();
    private final IntegrationOutboxProperties properties = properties();
    private final IntegrationOutboxDeliveryService deliveries =
            new IntegrationOutboxDeliveryService(
                    outbox,
                    List.of(consumer),
                    properties,
                    Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void deliversMatchingEventAndMarksItPublished() {
        IntegrationOutboxMessage message = pending();
        when(outbox.findNextReadyForUpdate(NOW))
                .thenReturn(Optional.of(message));
        when(outbox.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));

        assertThat(deliveries.deliverNext()).isTrue();

        verify(consumer).consume(message.event());
        ArgumentCaptor<IntegrationOutboxMessage> saved =
                ArgumentCaptor.forClass(IntegrationOutboxMessage.class);
        verify(outbox).save(saved.capture());
        assertThat(saved.getValue().published()).isTrue();
        assertThat(saved.getValue().publishedAt()).isEqualTo(NOW);
    }

    @Test
    void retryableFailureUsesExponentialBackoff() {
        IntegrationOutboxMessage message = pending();
        when(outbox.findNextReadyForUpdate(NOW))
                .thenReturn(Optional.of(message));
        when(outbox.findByEventIdForUpdate(message.event().eventId()))
                .thenReturn(Optional.of(message));
        when(outbox.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));
        org.mockito.Mockito.doThrow(
                new IntegrationEventConsumptionException(
                        "SOURCE_UNAVAILABLE", true, "not found"))
                .when(consumer).consume(message.event());

        IntegrationOutboxDeliveryException failure =
                org.assertj.core.api.Assertions.catchThrowableOfType(
                        deliveries::deliverNext,
                        IntegrationOutboxDeliveryException.class);
        IntegrationOutboxMessage failed = deliveries.recordFailure(failure);

        assertThat(failure.errorCode()).isEqualTo("SOURCE_UNAVAILABLE");
        assertThat(failure.retryable()).isTrue();
        assertThat(failed.attemptCount()).isEqualTo(1);
        assertThat(failed.nextAttemptAt()).isEqualTo(NOW.plusSeconds(10));
        assertThat(failed.deadLettered()).isFalse();
    }

    @Test
    void nonRetryableFailureMovesEventToDeadLetter() {
        IntegrationOutboxMessage message = pending();
        when(outbox.findNextReadyForUpdate(NOW))
                .thenReturn(Optional.of(message));
        when(outbox.findByEventIdForUpdate(message.event().eventId()))
                .thenReturn(Optional.of(message));
        when(outbox.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));
        org.mockito.Mockito.doThrow(
                new IntegrationEventConsumptionException(
                        "INVALID_PAYLOAD", false, "invalid"))
                .when(consumer).consume(message.event());

        IntegrationOutboxDeliveryException failure =
                org.assertj.core.api.Assertions.catchThrowableOfType(
                        deliveries::deliverNext,
                        IntegrationOutboxDeliveryException.class);
        IntegrationOutboxMessage failed = deliveries.recordFailure(failure);

        assertThat(failed.deadLettered()).isTrue();
        assertThat(failed.deadLetteredAt()).isEqualTo(NOW);
        assertThat(failed.nextAttemptAt()).isNull();
        assertThat(failed.lastError()).startsWith("INVALID_PAYLOAD");
    }

    @Test
    void retryableFailureAtMaxAttemptsMovesEventToDeadLetter() {
        IntegrationOutboxMessage message = pending()
                .recordFailure("TEMPORARY", NOW.minusSeconds(20),
                        NOW.minusSeconds(10))
                .recordFailure("TEMPORARY", NOW.minusSeconds(10), NOW);
        when(outbox.findNextReadyForUpdate(NOW))
                .thenReturn(Optional.of(message));
        when(outbox.findByEventIdForUpdate(message.event().eventId()))
                .thenReturn(Optional.of(message));
        when(outbox.save(any())).thenAnswer(
                invocation -> invocation.getArgument(0));
        org.mockito.Mockito.doThrow(
                new IntegrationEventConsumptionException(
                        "SOURCE_UNAVAILABLE", true, "not found"))
                .when(consumer).consume(message.event());

        IntegrationOutboxDeliveryException failure =
                org.assertj.core.api.Assertions.catchThrowableOfType(
                        deliveries::deliverNext,
                        IntegrationOutboxDeliveryException.class);
        IntegrationOutboxMessage failed = deliveries.recordFailure(failure);

        assertThat(failed.attemptCount()).isEqualTo(3);
        assertThat(failed.deadLettered()).isTrue();
        assertThat(failed.deadLetteredAt()).isEqualTo(NOW);
        assertThat(failed.nextAttemptAt()).isNull();
    }

    @Test
    void missingConsumerIsNonRetryable() {
        IntegrationOutboxDeliveryService withoutConsumer =
                new IntegrationOutboxDeliveryService(
                        outbox,
                        List.of(),
                        properties,
                        Clock.fixed(NOW, ZoneOffset.UTC));
        IntegrationOutboxMessage message = pending();
        when(outbox.findNextReadyForUpdate(NOW))
                .thenReturn(Optional.of(message));

        assertThatThrownBy(withoutConsumer::deliverNext)
                .isInstanceOfSatisfying(
                        IntegrationOutboxDeliveryException.class,
                        failure -> {
                            assertThat(failure.errorCode()).isEqualTo(
                                    "INTEGRATION_EVENT_CONSUMER_NOT_FOUND");
                            assertThat(failure.retryable()).isFalse();
                        });
    }

    private static IntegrationEventConsumer consumer() {
        IntegrationEventConsumer result = mock(IntegrationEventConsumer.class);
        when(result.consumerName()).thenReturn("persona-generation-v1");
        when(result.eventType()).thenReturn(EVENT_TYPE);
        return result;
    }

    private static IntegrationOutboxProperties properties() {
        IntegrationOutboxProperties result = new IntegrationOutboxProperties();
        result.setRetryInitialDelay(Duration.ofSeconds(10));
        result.setRetryMaxDelay(Duration.ofMinutes(1));
        result.setMaxAttempts(3);
        result.setBatchSize(2);
        return result;
    }

    private static IntegrationOutboxMessage pending() {
        return IntegrationOutboxMessage.pending(
                new IntegrationEventEnvelope(
                        UUID.randomUUID(),
                        EVENT_TYPE,
                        1,
                        NOW,
                        "SURVEY_RESPONSE",
                        UUID.randomUUID(),
                        "{}"),
                NOW);
    }
}
