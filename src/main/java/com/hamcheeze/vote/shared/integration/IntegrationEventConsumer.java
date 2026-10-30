package com.hamcheeze.vote.shared.integration;

public interface IntegrationEventConsumer {

    String consumerName();

    String eventType();

    void consume(IntegrationEventEnvelope event);
}
