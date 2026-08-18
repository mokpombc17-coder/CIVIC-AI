package com.hamcheeze.vote.task.infra.prediction;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("vote.task.prediction")
public class TaskPredictionProperties {

    private boolean enabled;
    private String candidatePolicyVersion = "candidate-policy-v1";
    private int requestedCandidateCount = 2;
    private Duration requestTimeout = Duration.ofSeconds(60);
    private int maximumAttempts = 2;
    private Duration retryDelay = Duration.ofSeconds(30);
    private Duration dispatcherDelay = Duration.ofSeconds(5);
    private int batchSize = 10;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getCandidatePolicyVersion() { return candidatePolicyVersion; }
    public void setCandidatePolicyVersion(String value) {
        this.candidatePolicyVersion = value;
    }
    public int getRequestedCandidateCount() { return requestedCandidateCount; }
    public void setRequestedCandidateCount(int value) {
        this.requestedCandidateCount = value;
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
