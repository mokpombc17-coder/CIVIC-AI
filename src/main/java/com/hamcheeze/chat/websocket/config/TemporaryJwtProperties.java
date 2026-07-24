package com.hamcheeze.chat.websocket.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.websocket.temporary-jwt")
public class TemporaryJwtProperties {

    @NotBlank
    @Size(min = 32)
    private String secret =
            "chat-limit-test-only-secret-key-32b";

    @NotBlank
    private String issuer = "chat-local";

    @NotBlank
    private String audience = "chat-server";

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public String getIssuer() {
        return issuer;
    }

    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

    public String getAudience() {
        return audience;
    }

    public void setAudience(String audience) {
        this.audience = audience;
    }
}
