package com.hamcheeze.chat.message.search;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Validated
@ConfigurationProperties("chat.message.search")
public class ChatMessageSearchProperties
        implements InitializingBean {

    @Min(1)
    @Max(50)
    private int defaultResultLimit = 20;

    @Min(1)
    @Max(50)
    private int maxResultLimit = 50;

    @Min(1)
    private int candidateChunkSize = 500;

    @Min(1)
    private int maxScannedPerRequest = 2_000;

    @NotNull
    private Duration requestDeadline = Duration.ofSeconds(1);

    @NotNull
    private Duration mongoQueryMaxTime = Duration.ofMillis(500);

    @NotNull
    private Duration cursorTtl = Duration.ofMinutes(10);

    @Min(1)
    private int maxConcurrentSearches = 4;

    @Min(1)
    private int userRateLimitPerSecond = 1;

    @Min(1)
    private int userRateLimitBurst = 3;

    public int getDefaultResultLimit() {
        return defaultResultLimit;
    }

    public void setDefaultResultLimit(int defaultResultLimit) {
        this.defaultResultLimit = defaultResultLimit;
    }

    public int getMaxResultLimit() {
        return maxResultLimit;
    }

    public void setMaxResultLimit(int maxResultLimit) {
        this.maxResultLimit = maxResultLimit;
    }

    public int getCandidateChunkSize() {
        return candidateChunkSize;
    }

    public void setCandidateChunkSize(int candidateChunkSize) {
        this.candidateChunkSize = candidateChunkSize;
    }

    public int getMaxScannedPerRequest() {
        return maxScannedPerRequest;
    }

    public void setMaxScannedPerRequest(
            int maxScannedPerRequest
    ) {
        this.maxScannedPerRequest = maxScannedPerRequest;
    }

    public Duration getRequestDeadline() {
        return requestDeadline;
    }

    public void setRequestDeadline(Duration requestDeadline) {
        this.requestDeadline = requirePositive(
                requestDeadline,
                "requestDeadline");
    }

    public Duration getMongoQueryMaxTime() {
        return mongoQueryMaxTime;
    }

    public void setMongoQueryMaxTime(Duration mongoQueryMaxTime) {
        this.mongoQueryMaxTime = requirePositive(
                mongoQueryMaxTime,
                "mongoQueryMaxTime");
    }

    public Duration getCursorTtl() {
        return cursorTtl;
    }

    public void setCursorTtl(Duration cursorTtl) {
        this.cursorTtl = requirePositive(cursorTtl, "cursorTtl");
    }

    public int getMaxConcurrentSearches() {
        return maxConcurrentSearches;
    }

    public void setMaxConcurrentSearches(
            int maxConcurrentSearches
    ) {
        this.maxConcurrentSearches = maxConcurrentSearches;
    }

    public int getUserRateLimitPerSecond() {
        return userRateLimitPerSecond;
    }

    public void setUserRateLimitPerSecond(
            int userRateLimitPerSecond
    ) {
        this.userRateLimitPerSecond = userRateLimitPerSecond;
    }

    public int getUserRateLimitBurst() {
        return userRateLimitBurst;
    }

    public void setUserRateLimitBurst(int userRateLimitBurst) {
        this.userRateLimitBurst = userRateLimitBurst;
    }

    @Override
    public void afterPropertiesSet() {
        if (defaultResultLimit > maxResultLimit) {
            throw new IllegalArgumentException(
                    "defaultResultLimit must not exceed "
                            + "maxResultLimit");
        }
        if (candidateChunkSize > maxScannedPerRequest) {
            throw new IllegalArgumentException(
                    "candidateChunkSize must not exceed "
                            + "maxScannedPerRequest");
        }
        if (mongoQueryMaxTime.compareTo(requestDeadline) > 0) {
            throw new IllegalArgumentException(
                    "mongoQueryMaxTime must not exceed "
                            + "requestDeadline");
        }
        if (mongoQueryMaxTime.toNanos() < 1_000_000) {
            throw new IllegalArgumentException(
                    "mongoQueryMaxTime must be at least 1ms");
        }
    }

    private Duration requirePositive(
            Duration value,
            String fieldName
    ) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(
                    fieldName + " must be positive");
        }
        return value;
    }
}
