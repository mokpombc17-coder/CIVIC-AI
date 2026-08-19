package com.hamcheeze.vote.shared.infra.integration.outbox;

import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxDeliveryException;
import com.hamcheeze.vote.shared.integration.outbox.IntegrationOutboxMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@ConditionalOnProperty(
        prefix = "vote.integration.outbox",
        name = "enabled",
        havingValue = "true")
public class IntegrationOutboxDispatcher {

    private static final Logger log = LoggerFactory.getLogger(
            IntegrationOutboxDispatcher.class);

    private final IntegrationOutboxDeliveryService deliveries;
    private final IntegrationOutboxProperties properties;

    public IntegrationOutboxDispatcher(
            IntegrationOutboxDeliveryService deliveries,
            IntegrationOutboxProperties properties
    ) {
        this.deliveries = Objects.requireNonNull(deliveries, "deliveries");
        this.properties = Objects.requireNonNull(properties, "properties");
    }

    @Scheduled(fixedDelayString =
            "${vote.integration.outbox.poller-delay:1s}")
    public void dispatchScheduled() {
        dispatchAvailable();
    }

    public int dispatchAvailable() {
        int dispatched = 0;
        for (int index = 0; index < properties.getBatchSize(); index++) {
            try {
                if (!deliveries.deliverNext()) {
                    break;
                }
            } catch (IntegrationOutboxDeliveryException failure) {
                IntegrationOutboxMessage failed =
                        deliveries.recordFailure(failure);
                log.warn(
                        "Integration event delivery failed: eventId={}, code={}, attemptCount={}, retryScheduled={}",
                        failure.eventId(),
                        failure.errorCode(),
                        failed.attemptCount(),
                        !failed.deadLettered());
            }
            dispatched++;
        }
        return dispatched;
    }
}
