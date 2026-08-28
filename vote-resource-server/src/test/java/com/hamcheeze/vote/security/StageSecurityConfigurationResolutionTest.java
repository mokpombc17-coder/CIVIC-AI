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
                            "spring.profiles.active=local,stage,auth-main");

    @Test
    void stageUsesMainAuthWhileKeepingLocalFeatureDefaults() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getEnvironment().getActiveProfiles())
                    .containsExactly("local", "stage", "auth-main");
            assertThat(context.getEnvironment().getProperty(
                    "server.port", Integer.class))
                    .isEqualTo(8082);
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
                    .isTrue();
            assertThat(context.getEnvironment().getProperty(
                    "vote.persona.enabled", Boolean.class))
                    .isTrue();
            assertThat(context.getEnvironment().getProperty(
                    "vote.task.prediction.enabled", Boolean.class))
                    .isTrue();
            assertThat(context.getEnvironment().getProperty(
                    "vote.survey.bootstrap.enabled", Boolean.class))
                    .isTrue();
            assertThat(context.getEnvironment().getProperty(
                    "vote.task.bootstrap.enabled", Boolean.class))
                    .isTrue();
        });
    }
}
