package com.hamcheeze.chat.pipeline;

import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.message-pipeline")
public class ChatMessagePipelineProperties {

    @Min(1)
    private int queueCapacity = 100;

    @Min(1)
    private long shutdownDrainTimeoutMs = 10_000;

    public int getQueueCapacity() {
        return queueCapacity;
    }

    public void setQueueCapacity(int queueCapacity) {
        this.queueCapacity = queueCapacity;
    }

    public long getShutdownDrainTimeoutMs() {
        return shutdownDrainTimeoutMs;
    }

    public void setShutdownDrainTimeoutMs(
            long shutdownDrainTimeoutMs
    ) {
        this.shutdownDrainTimeoutMs = shutdownDrainTimeoutMs;
    }
}
