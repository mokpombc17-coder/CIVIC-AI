package com.hamcheeze.chat.websocket.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.assertj.core.api.Assertions.assertThat;

class ProfileScopedConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withPropertyValues(
                            "spring.profiles.active=prod",
                            "chat.security.local-jwt.secret="
                                    + "should-not-bind-in-prod-32-bytes")
                    .withUserConfiguration(
                            LocalJwtConfiguration.class,
                            LocalRoomAuthorizationConfiguration.class);

    @Test
    void prodDoesNotCreateLocalJwtOrRoomProperties() {
        contextRunner.run(context -> {
            assertThat(context.getBeansOfType(
                    LocalJwtProperties.class)).isEmpty();
            assertThat(context.getBeansOfType(
                    LocalRoomProperties.class)).isEmpty();
            assertThat(context.getBeansOfType(
                    JwtDecoder.class)).isEmpty();
        });
    }

    @Test
    void prodJwtPropertiesCreateBootManagedJwtDecoder() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        OAuth2ResourceServerAutoConfiguration.class))
                .withPropertyValues(
                        "spring.security.oauth2.resourceserver.jwt.issuer-uri="
                                + "https://issuer.example",
                        "spring.security.oauth2.resourceserver.jwt.audiences[0]="
                                + "chat-server")
                .run(context -> assertThat(context)
                        .hasSingleBean(JwtDecoder.class));
    }
}
