package com.hamcheeze.chat.websocket.health;

import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.boot.health.contributor.Status;
import org.springframework.stereotype.Component;

@Component("chatPipeline")
public final class ChatPipelineHealthIndicator implements HealthIndicator {

    private final ChatMessagePipeline pipeline;

    public ChatPipelineHealthIndicator(ChatMessagePipeline pipeline) {
        this.pipeline = pipeline;
    }

    @Override
    public Health health() {
        if (pipeline.availability() == PipelineAvailability.AVAILABLE) {
            return Health.up().build();
        }
        return Health.status(Status.OUT_OF_SERVICE).build();
    }
}
