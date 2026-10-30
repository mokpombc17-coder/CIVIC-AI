package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.shared.integration.IntegrationEventConsumer;
import com.hamcheeze.vote.shared.integration.IntegrationEventConsumptionException;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxDeliveryException;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class IntegrationOutboxDeliveryService {

    private static final int MAX_ERROR_LENGTH = 1000;

    private final IntegrationOutboxRepository outbox;
    private final List<IntegrationEventConsumer> consumers;
    private final IntegrationOutboxProperties properties;
    private final Clock clock;

    @Autowired
    public IntegrationOutboxDeliveryService(
            IntegrationOutboxRepository outbox,
            List<IntegrationEventConsumer> consumers,
            IntegrationOutboxProperties properties
    ) {
        this(outbox, consumers, properties, Clock.systemUTC());
    }

    IntegrationOutboxDeliveryService(
            IntegrationOutboxRepository outbox,
            List<IntegrationEventConsumer> consumers,
            IntegrationOutboxProperties properties,
            Clock clock
    ) {
        this.outbox = Objects.requireNonNull(outbox, "outbox");
        this.consumers = List.copyOf(
                Objects.requireNonNull(consumers, "consumers"));
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        validateProperties(properties);
        validateConsumers(this.consumers);
    }

    @Transactional
    public boolean deliverNext() {
        Optional<IntegrationOutboxMessage> candidate =
                outbox.findNextReadyForUpdate(clock.instant());
        if (candidate.isEmpty()) {
            return false;
        }
        IntegrationOutboxMessage message = candidate.get();
        try {
            List<IntegrationEventConsumer> matching = consumers.stream()
                    .filter(consumer -> consumer.eventType().equals(
                            message.event().eventType()))
                    .toList();
            if (matching.isEmpty()) {
                throw new IntegrationEventConsumptionException(
                        "INTEGRATION_EVENT_CONSUMER_NOT_FOUND",
                        false,
                        "no consumer for event type: "
                                + message.event().eventType());
            }
            matching.forEach(consumer -> consumer.consume(message.event()));
            outbox.save(message.markPublished(clock.instant()));
            return true;
        } catch (RuntimeException exception) {
            throw deliveryFailure(message, exception);
        }
    }

    @Transactional
    public IntegrationOutboxMessage recordFailure(
            IntegrationOutboxDeliveryException failure
    ) {
        Objects.requireNonNull(failure, "failure");
        IntegrationOutboxMessage message = outbox.findByEventIdForUpdate(
                        failure.eventId())
                .orElseThrow(() -> new IllegalStateException(
                        "failed outbox event not found"));
        if (message.published() || message.deadLettered()) {
            return message;
        }
        Instant failedAt = clock.instant();
        int nextAttemptCount = message.attemptCount() + 1;
        boolean retry = failure.retryable()
                && nextAttemptCount < properties.getMaxAttempts();
        Instant retryAt = retry
                ? failedAt.plus(retryDelay(nextAttemptCount))
                : null;
        return outbox.save(message.recordFailure(
                formatError(failure), failedAt, retryAt));
    }

    private Duration retryDelay(int attemptCount) {
        long multiplier = 1L << Math.min(
                Math.max(0, attemptCount - 1), 30);
        Duration calculated = properties.getRetryInitialDelay()
                .multipliedBy(multiplier);
        return calculated.compareTo(properties.getRetryMaxDelay()) > 0
                ? properties.getRetryMaxDelay()
                : calculated;
    }

    private static IntegrationOutboxDeliveryException deliveryFailure(
            IntegrationOutboxMessage message,
            RuntimeException exception
    ) {
        IntegrationEventConsumptionException consumption =
                findConsumptionException(exception);
        String errorCode = consumption == null
                ? "INTEGRATION_EVENT_DELIVERY_FAILED"
                : consumption.errorCode();
        boolean retryable = consumption == null || consumption.retryable();
        return new IntegrationOutboxDeliveryException(
                message.event().eventId(),
                errorCode,
                retryable,
                "integration event delivery failed",
                exception);
    }

    private static IntegrationEventConsumptionException
    findConsumptionException(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof IntegrationEventConsumptionException found) {
                return found;
            }
            current = current.getCause();
        }
        return null;
    }

    private static String formatError(
            IntegrationOutboxDeliveryException failure
    ) {
        String detail = failure.getCause() == null
                ? failure.getMessage()
                : failure.getCause().getMessage();
        String result = failure.errorCode()
                + (detail == null || detail.isBlank() ? "" : ": " + detail);
        return result.length() <= MAX_ERROR_LENGTH
                ? result : result.substring(0, MAX_ERROR_LENGTH);
    }

    private static void validateProperties(
            IntegrationOutboxProperties properties
    ) {
        if (properties.getBatchSize() < 1
                || properties.getMaxAttempts() < 1) {
            throw new IllegalArgumentException(
                    "outbox batchSize and maxAttempts must be positive");
        }
        if (properties.getRetryInitialDelay() == null
                || properties.getRetryInitialDelay().isNegative()
                || properties.getRetryInitialDelay().isZero()
                || properties.getRetryMaxDelay() == null
                || properties.getRetryMaxDelay().compareTo(
                properties.getRetryInitialDelay()) < 0) {
            throw new IllegalArgumentException(
                    "outbox retry delays are invalid");
        }
    }

    private static void validateConsumers(
            List<IntegrationEventConsumer> consumers
    ) {
        long distinct = consumers.stream()
                .map(consumer -> consumer.eventType()
                        + "\u0000" + consumer.consumerName())
                .distinct()
                .count();
        if (distinct != consumers.size()) {
            throw new IllegalArgumentException(
                    "duplicate integration event consumer registration");
        }
    }
}
