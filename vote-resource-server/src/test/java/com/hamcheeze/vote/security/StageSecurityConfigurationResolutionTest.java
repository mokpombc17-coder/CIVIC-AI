package com.hamcheeze.vote.security;

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
                            "spring.profiles.active=stage,auth-main",
                            "VOTE_DB_URL="
                                    + "jdbc:postgresql://vote-db:5432/vote",
                            "VOTE_DB_USERNAME=stage-vote",
                            "VOTE_DB_PASSWORD=stage-vote-secret",
                            "VOTE_AI_RUNTIME_AUTH_TOKEN="
                                    + "stage-shared-runtime-token");

    @Test
    void stageUsesMainAuthAndSchedulersWithoutLocalFixtures() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getEnvironment().getActiveProfiles())
                    .containsExactly("stage", "auth-main");
            assertThat(context.getEnvironment().getProperty(
                    "server.port", Integer.class))
                    .isEqualTo(8082);
            assertThat(context.getEnvironment().getProperty(
                    "spring.datasource.url"))
                    .isEqualTo(
                            "jdbc:postgresql://vote-db:5432/vote");
            assertThat(context.getEnvironment().getProperty(
                    "spring.datasource.username"))
                    .isEqualTo("stage-vote");
            assertThat(context.getEnvironment().getProperty(
                    "spring.datasource.password"))
                    .isEqualTo("stage-vote-secret");
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
                    "vote.security.local-admin-api-enabled", Boolean.class))
                    .isFalse();
            assertThat(context.getEnvironment().getProperty(
                    "vote.integration.outbox.dispatcher-enabled",
                    Boolean.class))
                    .isFalse();
            assertThat(context.getEnvironment().getProperty(
                    "vote.persona.enabled", Boolean.class))
                    .isFalse();
            assertThat(context.getEnvironment().getProperty(
                    "vote.task.prediction.enabled", Boolean.class))
                    .isFalse();
            assertThat(context.getEnvironment().getProperty(
                    "vote.ai-runtime.auth-token"))
                    .isEqualTo("stage-shared-runtime-token");
            assertThat(context.getEnvironment().getProperty(
                    "vote.persona.auth-token"))
                    .isEqualTo("stage-shared-runtime-token");
            assertThat(context.getEnvironment().getProperty(
                    "vote.task.preparation.auth-token"))
                    .isEqualTo("stage-shared-runtime-token");
            assertThat(context.getEnvironment().getProperty(
                    "vote.task.prediction.auth-token"))
                    .isEqualTo("stage-shared-runtime-token");
            assertThat(context.getEnvironment().getProperty(
                    "vote.task.lifecycle.enabled", Boolean.class))
                    .isTrue();
            assertThat(context.getEnvironment().getProperty(
                    "vote.survey.round-activation.enabled", Boolean.class))
                    .isTrue();
            assertThat(context.getEnvironment().getProperty(
                    "vote.survey.bootstrap.enabled", Boolean.class))
                    .isFalse();
            assertThat(context.getEnvironment().getProperty(
                    "vote.task.bootstrap.enabled", Boolean.class))
                    .isFalse();
        });
    }
}
