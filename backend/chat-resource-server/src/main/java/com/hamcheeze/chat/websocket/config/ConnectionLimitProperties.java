package com.hamcheeze.chat.websocket.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.websocket.connection")
public class ConnectionLimitProperties {

    @Min(1)
    private int maxActiveAuthenticated = 500;

    @Min(1)
    @Max(1)
    private int maxPerUser = 1;

    @AssertTrue
    private boolean replaceExistingConnection = true;

    public int getMaxActiveAuthenticated() {
        return maxActiveAuthenticated;
    }

    public void setMaxActiveAuthenticated(int maxActiveAuthenticated) {
        this.maxActiveAuthenticated = maxActiveAuthenticated;
    }

    public int getMaxPerUser() {
        return maxPerUser;
    }

    public void setMaxPerUser(int maxPerUser) {
        this.maxPerUser = maxPerUser;
    }

    public boolean isReplaceExistingConnection() {
        return replaceExistingConnection;
    }

    public void setReplaceExistingConnection(boolean replaceExistingConnection) {
        this.replaceExistingConnection = replaceExistingConnection;
    }
}
