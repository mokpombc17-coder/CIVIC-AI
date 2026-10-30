package com.hamcheeze.chat.websocket.config;

import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.websocket.heartbeat")
public class HeartbeatProperties {

    @Min(1)
    private long intervalMs = 10_000;
    @Min(1)
    private long clientOutgoingMinMs = 1;
    @Min(1)
    private long clientOutgoingMaxMs = 10_000;
    @Min(1)
    private long clientIncomingMinMs = 1;
    @Min(1)
    private long clientIncomingMaxMs = 10_000;

    public long getIntervalMs() {
        return intervalMs;
    }

    public void setIntervalMs(long intervalMs) {
        this.intervalMs = intervalMs;
    }

    public long getClientOutgoingMinMs() {
        return clientOutgoingMinMs;
    }

    public void setClientOutgoingMinMs(long clientOutgoingMinMs) {
        this.clientOutgoingMinMs = clientOutgoingMinMs;
    }

    public long getClientOutgoingMaxMs() {
        return clientOutgoingMaxMs;
    }

    public void setClientOutgoingMaxMs(long clientOutgoingMaxMs) {
        this.clientOutgoingMaxMs = clientOutgoingMaxMs;
    }

    public long getClientIncomingMinMs() {
        return clientIncomingMinMs;
    }

    public void setClientIncomingMinMs(long clientIncomingMinMs) {
        this.clientIncomingMinMs = clientIncomingMinMs;
    }

    public long getClientIncomingMaxMs() {
        return clientIncomingMaxMs;
    }

    public void setClientIncomingMaxMs(long clientIncomingMaxMs) {
        this.clientIncomingMaxMs = clientIncomingMaxMs;
    }
}
