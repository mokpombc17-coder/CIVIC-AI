package com.hamcheeze.chat.message.outbox;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.outbox")
public class ChatMessageOutboxProperties {

    @Min(1)
    private long pollIntervalMs = 100;

    @Min(1)
    private long claimTimeoutMs = 30_000;

    @Min(1)
    private int batchSize = 100;

    @Min(1)
    private long shutdownDrainTimeoutMs = 10_000;

    @Min(1)
    private long metricsSampleIntervalMs = 10_000;

    @Valid
    @NotNull
    private Retry retry = new Retry();

    public long getPollIntervalMs() {
        return pollIntervalMs;
    }

    public void setPollIntervalMs(long pollIntervalMs) {
        this.pollIntervalMs = pollIntervalMs;
    }

    public long getClaimTimeoutMs() {
        return claimTimeoutMs;
    }

    public void setClaimTimeoutMs(long claimTimeoutMs) {
        this.claimTimeoutMs = claimTimeoutMs;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }

    public long getShutdownDrainTimeoutMs() {
        return shutdownDrainTimeoutMs;
    }

    public void setShutdownDrainTimeoutMs(
            long shutdownDrainTimeoutMs
    ) {
        this.shutdownDrainTimeoutMs = shutdownDrainTimeoutMs;
    }

    public long getMetricsSampleIntervalMs() {
        return metricsSampleIntervalMs;
    }

    public void setMetricsSampleIntervalMs(
            long metricsSampleIntervalMs
    ) {
        this.metricsSampleIntervalMs = metricsSampleIntervalMs;
    }

    public Retry getRetry() {
        return retry;
    }

    public void setRetry(Retry retry) {
        this.retry = retry;
    }

    public static class Retry {

        @Min(1)
        private long initialBackoffMs = 250;

        @Min(1)
        private long maxBackoffMs = 30_000;

        public long getInitialBackoffMs() {
            return initialBackoffMs;
        }

        public void setInitialBackoffMs(long initialBackoffMs) {
            this.initialBackoffMs = initialBackoffMs;
        }

        public long getMaxBackoffMs() {
            return maxBackoffMs;
        }

        public void setMaxBackoffMs(long maxBackoffMs) {
            this.maxBackoffMs = maxBackoffMs;
        }
    }
}
