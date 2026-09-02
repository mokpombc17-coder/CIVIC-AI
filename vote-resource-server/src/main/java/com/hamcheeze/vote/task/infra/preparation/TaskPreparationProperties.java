package com.hamcheeze.vote.task.infra.preparation;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("vote.task.preparation")
public class TaskPreparationProperties {

    private boolean enabled;
    private String provider = "http";
    private String baseUrl = "http://localhost:8090";
    private String path = "/v1/tasks/prepare";
    private String authToken;
    private Duration connectTimeout = Duration.ofSeconds(5);
    private Duration requestTimeout = Duration.ofSeconds(30);
    private Duration retryDelay = Duration.ofSeconds(30);
    private Duration processingLeaseDuration = Duration.ofSeconds(60);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { this.enabled = value; }
    public String getProvider() { return provider; }
    public void setProvider(String value) { this.provider = value; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String value) { this.baseUrl = value; }
    public String getPath() { return path; }
    public void setPath(String value) { this.path = value; }
    public String getAuthToken() { return authToken; }
    public void setAuthToken(String value) { this.authToken = value; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration value) { this.connectTimeout = value; }
    public Duration getRequestTimeout() { return requestTimeout; }
    public void setRequestTimeout(Duration value) { this.requestTimeout = value; }
    public Duration getRetryDelay() { return retryDelay; }
    public void setRetryDelay(Duration value) { this.retryDelay = value; }
    public Duration getProcessingLeaseDuration() {
        return processingLeaseDuration;
    }
    public void setProcessingLeaseDuration(Duration value) {
        this.processingLeaseDuration = value;
    }
}
