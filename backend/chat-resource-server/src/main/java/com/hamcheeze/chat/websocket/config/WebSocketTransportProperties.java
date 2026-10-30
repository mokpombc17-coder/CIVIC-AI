package com.hamcheeze.chat.websocket.config;

import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.websocket.transport")
public class WebSocketTransportProperties {

    @Min(1)
    private int timeToFirstMessageMs = 10_000;
    @Min(1)
    private int sendBufferSizeLimitPerConnectionBytes = 256 * 1_024;
    @Min(1)
    private int sendTimeLimitPerConnectionMs = 10_000;

    public int getTimeToFirstMessageMs() {
        return timeToFirstMessageMs;
    }

    public void setTimeToFirstMessageMs(int value) {
        this.timeToFirstMessageMs = value;
    }

    public int getSendBufferSizeLimitPerConnectionBytes() {
        return sendBufferSizeLimitPerConnectionBytes;
    }

    public void setSendBufferSizeLimitPerConnectionBytes(int value) {
        this.sendBufferSizeLimitPerConnectionBytes = value;
    }

    public int getSendTimeLimitPerConnectionMs() {
        return sendTimeLimitPerConnectionMs;
    }

    public void setSendTimeLimitPerConnectionMs(int value) {
        this.sendTimeLimitPerConnectionMs = value;
    }
}
