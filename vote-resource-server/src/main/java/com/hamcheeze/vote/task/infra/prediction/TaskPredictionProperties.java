package com.hamcheeze.vote.task.infra.prediction;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("vote.task.prediction")
public class TaskPredictionProperties {

    private boolean enabled;
    private String baseUrl = "http://localhost:8090";
    private String path = "/v1/task-predictions";
    private String authToken;
    private Duration connectTimeout = Duration.ofSeconds(5);
    private String candidatePolicyVersion = "candidate-policy-v1";
    private Duration requestTimeout = Duration.ofSeconds(60);
    private int maximumAttempts = 2;
    private Duration retryDelay = Duration.ofSeconds(30);
    private Duration dispatcherDelay = Duration.ofSeconds(5);
    private int batchSize = 10;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String value) { this.baseUrl = value; }
    public String getPath() { return path; }
    public void setPath(String value) { this.path = value; }
    public String getAuthToken() { return authToken; }
    public void setAuthToken(String value) { this.authToken = value; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration value) {
        this.connectTimeout = value;
    }
    public String getCandidatePolicyVersion() { return candidatePolicyVersion; }
    public void setCandidatePolicyVersion(String value) {
        this.candidatePolicyVersion = value;
    }
    public Duration getRequestTimeout() { return requestTimeout; }
    public void setRequestTimeout(Duration value) { this.requestTimeout = value; }
    public int getMaximumAttempts() { return maximumAttempts; }
    public void setMaximumAttempts(int value) { this.maximumAttempts = value; }
    public Duration getRetryDelay() { return retryDelay; }
    public void setRetryDelay(Duration value) { this.retryDelay = value; }
    public Duration getDispatcherDelay() { return dispatcherDelay; }
    public void setDispatcherDelay(Duration value) { this.dispatcherDelay = value; }
    public int getBatchSize() { return batchSize; }
    public void setBatchSize(int value) { this.batchSize = value; }
}
