package com.hamcheeze.vote.persona.infra;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("vote.persona")
public class PersonaGenerationProperties {

    private boolean enabled;
    private String provider = "http";
    private String baseUrl = "http://localhost:8090";
    private String authToken;
    private Duration connectTimeout = Duration.ofSeconds(5);
    private Duration requestTimeout = Duration.ofSeconds(60);
    private Duration dispatcherDelay = Duration.ofSeconds(5);
    private Duration retryInitialDelay = Duration.ofSeconds(30);
    private Duration retryMaxDelay = Duration.ofMinutes(2);
    private int maxAttempts = 3;
    private int batchSize = 10;
    private Duration processingLeaseDuration = Duration.ofSeconds(90);
    private Duration leaseReaperDelay = Duration.ofSeconds(10);
    private int workerPoolSize = 4;
    private int workerQueueCapacity = 20;
    private Duration workerShutdownAwait = Duration.ofSeconds(30);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getAuthToken() {
        return authToken;
    }

    public void setAuthToken(String authToken) {
        this.authToken = authToken;
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public Duration getRequestTimeout() {
        return requestTimeout;
    }

    public void setRequestTimeout(Duration requestTimeout) {
        this.requestTimeout = requestTimeout;
    }

    public Duration getDispatcherDelay() {
        return dispatcherDelay;
    }

    public void setDispatcherDelay(Duration dispatcherDelay) {
        this.dispatcherDelay = dispatcherDelay;
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

    public Duration getProcessingLeaseDuration() {
        return processingLeaseDuration;
    }

    public void setProcessingLeaseDuration(Duration processingLeaseDuration) {
        this.processingLeaseDuration = processingLeaseDuration;
    }

    public Duration getLeaseReaperDelay() {
        return leaseReaperDelay;
    }

    public void setLeaseReaperDelay(Duration leaseReaperDelay) {
        this.leaseReaperDelay = leaseReaperDelay;
    }

    public int getWorkerPoolSize() {
        return workerPoolSize;
    }

    public void setWorkerPoolSize(int workerPoolSize) {
        this.workerPoolSize = workerPoolSize;
    }

    public int getWorkerQueueCapacity() {
        return workerQueueCapacity;
    }

    public void setWorkerQueueCapacity(int workerQueueCapacity) {
        this.workerQueueCapacity = workerQueueCapacity;
    }

    public Duration getWorkerShutdownAwait() {
        return workerShutdownAwait;
    }

    public void setWorkerShutdownAwait(Duration workerShutdownAwait) {
        this.workerShutdownAwait = workerShutdownAwait;
    }
}
