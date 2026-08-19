package com.hamcheeze.vote.task.infra.integration;

import com.hamcheeze.vote.task.application.port.out.TaskOpinionMapFinalizationRequestedEventPublisher;
import com.hamcheeze.vote.task.application.task.TaskClosureFact;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@ConditionalOnProperty(
        prefix = "vote.task.opinion-map-finalization-outbox",
        name = "enabled",
        havingValue = "false",
        matchIfMissing = true)
final class DisabledTaskOpinionMapFinalizationRequestedEventPublisher
        implements TaskOpinionMapFinalizationRequestedEventPublisher {

    @Override
    public void publish(
            TaskClosureFact closureFact,
            int expectedSubmissionCount
    ) {
        Objects.requireNonNull(closureFact, "closureFact");
        if (expectedSubmissionCount < 0) {
            throw new IllegalArgumentException(
                    "expectedSubmissionCount must not be negative");
        }
        // Producer rollout waits until the OpinionMap consumer is available.
    }
}
