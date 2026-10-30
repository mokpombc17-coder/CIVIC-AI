package com.hamcheeze.vote.shared.infra.integration.outbox;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("vote.integration.outbox")
public class IntegrationOutboxProperties {

    private boolean enabled;
    private Duration pollerDelay = Duration.ofSeconds(1);
    private Duration retryInitialDelay = Duration.ofSeconds(5);
    private Duration retryMaxDelay = Duration.ofMinutes(5);
    private int maxAttempts = 10;
    private int batchSize = 20;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Duration getPollerDelay() {
        return pollerDelay;
    }

    public void setPollerDelay(Duration pollerDelay) {
        this.pollerDelay = pollerDelay;
    }

    public Duration getRetryInitialDelay() {
        return retryInitialDelay;
    }

    public void setRetryInitialDelay(Duration retryInitialDelay) {
        this.retryInitialDelay = retryInitialDelay;
    }

    public Duration getRetryMaxDelay() {
        return retryMaxDelay;
    }

    public void setRetryMaxDelay(Duration retryMaxDelay) {
        this.retryMaxDelay = retryMaxDelay;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(int maxAttempts) {
        this.maxAttempts = maxAttempts;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }
}
