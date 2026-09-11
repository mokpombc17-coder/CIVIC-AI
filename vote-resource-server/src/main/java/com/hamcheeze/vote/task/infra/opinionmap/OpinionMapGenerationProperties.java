package com.hamcheeze.vote.task.infra.opinionmap;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("vote.task.opinion-map")
public class OpinionMapGenerationProperties {

    private boolean enabled;
    private String provider = "none";
    private String baseUrl = "https://openrouter.ai";
    private String path = "/api/v1/chat/completions";
    private String apiKey;
    private String model = "openai/gpt-5.6-luna";
    private Duration connectTimeout = Duration.ofSeconds(5);
    private int maximumOutputTokens = 4096;
    private String promptVersion = "task-result-prompt/v1";
    private Duration requestTimeout = Duration.ofSeconds(60);
    private int maximumAttempts = 3;
    private Duration retryDelay = Duration.ofSeconds(30);
    private Duration processingLeaseDuration = Duration.ofSeconds(90);
    private Duration dispatcherDelay = Duration.ofSeconds(5);
    private int batchSize = 10;
    private int workerPoolSize = 2;
    private int workerQueueCapacity = 10;
    private Duration workerShutdownAwait = Duration.ofSeconds(10);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }
    public int getMaximumOutputTokens() { return maximumOutputTokens; }
    public void setMaximumOutputTokens(int maximumOutputTokens) {
        this.maximumOutputTokens = maximumOutputTokens;
    }
    public String getPromptVersion() { return promptVersion; }
    public void setPromptVersion(String promptVersion) {
        this.promptVersion = promptVersion;
    }
    public Duration getRequestTimeout() { return requestTimeout; }
    public void setRequestTimeout(Duration requestTimeout) {
        this.requestTimeout = requestTimeout;
    }
    public int getMaximumAttempts() { return maximumAttempts; }
    public void setMaximumAttempts(int maximumAttempts) {
        this.maximumAttempts = maximumAttempts;
    }
    public Duration getRetryDelay() { return retryDelay; }
    public void setRetryDelay(Duration retryDelay) {
        this.retryDelay = retryDelay;
    }
    public Duration getProcessingLeaseDuration() {
        return processingLeaseDuration;
    }
    public void setProcessingLeaseDuration(Duration value) {
        this.processingLeaseDuration = value;
    }
    public Duration getDispatcherDelay() { return dispatcherDelay; }
    public void setDispatcherDelay(Duration dispatcherDelay) {
        this.dispatcherDelay = dispatcherDelay;
    }
    public int getBatchSize() { return batchSize; }
    public void setBatchSize(int batchSize) { this.batchSize = batchSize; }
    public int getWorkerPoolSize() { return workerPoolSize; }
    public void setWorkerPoolSize(int workerPoolSize) {
        this.workerPoolSize = workerPoolSize;
    }
    public int getWorkerQueueCapacity() { return workerQueueCapacity; }
    public void setWorkerQueueCapacity(int workerQueueCapacity) {
        this.workerQueueCapacity = workerQueueCapacity;
    }
    public Duration getWorkerShutdownAwait() { return workerShutdownAwait; }
    public void setWorkerShutdownAwait(Duration workerShutdownAwait) {
        this.workerShutdownAwait = workerShutdownAwait;
    }
}
