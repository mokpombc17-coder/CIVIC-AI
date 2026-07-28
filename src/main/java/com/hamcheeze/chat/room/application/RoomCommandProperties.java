package com.hamcheeze.chat.room.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Objects;

@ConfigurationProperties("chat.room.command")
public class RoomCommandProperties {

    private Duration receiptTtl = Duration.ofHours(1);
    private int maxAttempts = 3;
    private Duration retryBackoff = Duration.ofMillis(10);

    public Duration receiptTtl() {
        return receiptTtl;
    }

    public void setReceiptTtl(Duration receiptTtl) {
        this.receiptTtl = Objects.requireNonNull(
                receiptTtl,
                "receiptTtl");
        validateReceiptTtl();
    }

    public int maxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(int maxAttempts) {
        if (maxAttempts < 1) {
            throw new IllegalArgumentException(
                    "maxAttempts must be at least 1");
        }
        this.maxAttempts = maxAttempts;
    }

    public Duration retryBackoff() {
        return retryBackoff;
    }

    public void setRetryBackoff(Duration retryBackoff) {
        this.retryBackoff = Objects.requireNonNull(
                retryBackoff,
                "retryBackoff");
        if (retryBackoff.isNegative()) {
            throw new IllegalArgumentException(
                    "retryBackoff must not be negative");
        }
    }

    private void validateReceiptTtl() {
        if (receiptTtl.isZero() || receiptTtl.isNegative()) {
            throw new IllegalArgumentException(
                    "receiptTtl must be positive");
        }
    }
}
