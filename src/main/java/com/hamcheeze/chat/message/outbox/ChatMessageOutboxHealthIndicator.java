package com.hamcheeze.chat.message.outbox;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.boot.health.contributor.Status;
import org.springframework.stereotype.Component;

@Component("chatOutbox")
public final class ChatMessageOutboxHealthIndicator
        implements HealthIndicator {

    private final ChatMessageOutboxDispatcher dispatcher;

    public ChatMessageOutboxHealthIndicator(
            ChatMessageOutboxDispatcher dispatcher
    ) {
        this.dispatcher = dispatcher;
    }

    @Override
    public Health health() {
        ChatMessageOutboxDispatcher.State state =
                dispatcher.state();
        Health.Builder builder;
        if (state == ChatMessageOutboxDispatcher.State.RUNNING) {
            builder = Health.up();
        } else if (state
                == ChatMessageOutboxDispatcher.State.FAILED) {
            builder = Health.down();
        } else {
            builder = Health.status(Status.OUT_OF_SERVICE);
        }
        return builder
                .withDetail("state", state.name())
                .withDetail(
                        "workerRunning",
                        dispatcher.workerRunning())
                .withDetail("inFlight", dispatcher.inFlight())
                .build();
    }
}
