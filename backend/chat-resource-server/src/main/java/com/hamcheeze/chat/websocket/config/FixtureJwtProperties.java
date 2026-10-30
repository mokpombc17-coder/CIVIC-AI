package com.hamcheeze.chat.websocket.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("chat.security.local-jwt")
public class FixtureJwtProperties {

    @NotBlank
    @Size(min = 32)
    private String secret =
            "civic-ai-local-auth-fixture-signing-key-v1-"
                    + "public-do-not-use-in-production";

    @NotBlank
    private String issuer = "http://localhost:3000/api/dev/auth";

    @NotBlank
    private String audience = "civic-ai-api";

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
