package com.hamcheeze.chat.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class StageSecurityConfigurationResolutionTest {

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withInitializer(
                            new ConfigDataApplicationContextInitializer())
                    .withPropertyValues(
                            "spring.profiles.active=local,stage,auth-main");

    @Test
    void stageUsesMainAuthAndKeepsLocalChatDefaults() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getEnvironment().getActiveProfiles())
                    .containsExactly("local", "stage", "auth-main");
            assertThat(context.getEnvironment().getProperty(
                    "server.port", Integer.class))
                    .isEqualTo(8081);
            assertThat(context.getEnvironment().getProperty(
                    "civic.auth.issuer"))
                    .isEqualTo("https://140-238-17-223.sslip.io");
            assertThat(context.getEnvironment().getProperty(
                    "civic.auth.jwks-uri"))
                    .isEqualTo("https://140-238-17-223.sslip.io/"
                            + ".well-known/jwks.json");
            assertThat(context.getEnvironment().getProperty(
                    "civic.auth.browser-origin"))
                    .isEqualTo("https://140-238-17-223.sslip.io");
            assertThat(context.getEnvironment().getProperty(
                    "civic.auth.allow-insecure-loopback", Boolean.class))
                    .isFalse();
            assertThat(context.getEnvironment().getProperty(
                    "chat.websocket.allowed-origins[0]"))
                    .isEqualTo("https://140-238-17-223.sslip.io");
            assertThat(context.getEnvironment().getProperty(
                    "chat.security.cors.allowed-origins[0]"))
                    .isEqualTo("https://140-238-17-223.sslip.io");
            assertThat(context.getEnvironment().getProperty(
                    "chat.security.cookie-authentication-enabled",
                    Boolean.class))
                    .isTrue();
            assertThat(context.getEnvironment().getProperty(
                    "chat.room.creation.mode"))
                    .isEqualTo("DIRECT");
        });
    }
}
