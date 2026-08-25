package com.hamcheeze.vote.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class ProductionSecurityConfigurationResolutionTest {

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withInitializer(
                            new ConfigDataApplicationContextInitializer())
                    .withPropertyValues("spring.profiles.active=prod");

    @Test
    void productionUsesContainerAndPausedPersonaDefaults() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getEnvironment().getProperty(
                    "server.port", Integer.class))
                    .isEqualTo(8083);
            assertThat(context.getEnvironment().getProperty(
                    "spring.datasource.url"))
                    .isEqualTo("jdbc:postgresql://vote-db:5432/vote");
            assertThat(context.getEnvironment().getProperty(
                    "spring.security.oauth2.resourceserver.jwt.audiences[0]"))
                    .isEqualTo("civic-ai-api");
            assertThat(context.getEnvironment().getProperty(
                    "vote.security.cookie-authentication-enabled",
                    Boolean.class))
                    .isTrue();
            assertThat(context.getEnvironment().getProperty(
                    "vote.integration.outbox.dispatcher-enabled",
                    Boolean.class))
                    .isFalse();
            assertThat(context.getEnvironment().getProperty(
                    "vote.persona.enabled", Boolean.class))
                    .isFalse();
        });
    }

    @Test
    void productionDefaultsRemainOverridable() {
        runner.withPropertyValues(
                        "SERVER_PORT=9083",
                        "VOTE_DB_URL=jdbc:postgresql://custom-db:5432/custom-vote",
                        "VOTE_JWT_AUDIENCE=dedicated-vote-api",
                        "VOTE_SECURITY_COOKIE_AUTHENTICATION_ENABLED=false",
                        "VOTE_INTEGRATION_OUTBOX_DISPATCHER_ENABLED=true",
                        "VOTE_PERSONA_ENABLED=true")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getEnvironment().getProperty(
                            "server.port", Integer.class))
                            .isEqualTo(9083);
                    assertThat(context.getEnvironment().getProperty(
                            "spring.datasource.url"))
                            .isEqualTo(
                                    "jdbc:postgresql://custom-db:5432/custom-vote");
                    assertThat(context.getEnvironment().getProperty(
                            "spring.security.oauth2.resourceserver.jwt.audiences[0]"))
                            .isEqualTo("dedicated-vote-api");
                    assertThat(context.getEnvironment().getProperty(
                            "vote.security.cookie-authentication-enabled",
                            Boolean.class))
                            .isFalse();
                    assertThat(context.getEnvironment().getProperty(
                            "vote.integration.outbox.dispatcher-enabled",
                            Boolean.class))
                            .isTrue();
                    assertThat(context.getEnvironment().getProperty(
                            "vote.persona.enabled", Boolean.class))
                            .isTrue();
                });
    }
}
