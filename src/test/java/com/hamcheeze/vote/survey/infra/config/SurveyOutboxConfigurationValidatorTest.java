package com.hamcheeze.vote.survey.infra.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class SurveyOutboxConfigurationValidatorTest {

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void warnsWhenDispatcherIsPausedInProduction(CapturedOutput output) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        SurveyOutboxConfigurationValidator validator =
                new SurveyOutboxConfigurationValidator(environment, false);

        assertThatCode(validator::afterSingletonsInstantiated)
                .doesNotThrowAnyException();
        assertThat(output)
                .contains("Survey Persona delivery is paused")
                .contains("dispatcher-enabled=false")
                .contains("SurveyResponseSubmitted")
                .contains("remain PENDING");
    }

    @Test
    void acceptsEnabledOutboxInProduction() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");

        assertThatCode(() -> new SurveyOutboxConfigurationValidator(
                environment, true).afterSingletonsInstantiated())
                .doesNotThrowAnyException();
    }

    @Test
    void testProfileCanExplicitlyDisableOutbox() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("test");

        assertThatCode(() -> new SurveyOutboxConfigurationValidator(
                environment, false).afterSingletonsInstantiated())
                .doesNotThrowAnyException();
    }

    @Test
    void productionProfilePausesDispatcherByDefault() {
        productionContext().run(context -> {
            assertThat(context)
                    .hasNotFailed()
                    .doesNotHaveBean(OutboxEnabledProbe.class);
        });
    }

    @Test
    void productionContextCanExplicitlyEnableDispatcher() {
        productionContext()
                .withPropertyValues(
                        "vote.integration.outbox.dispatcher-enabled=true")
                .run(context -> assertThat(context)
                        .hasNotFailed()
                        .hasSingleBean(OutboxEnabledProbe.class));
    }

    private static ApplicationContextRunner productionContext() {
        return new ApplicationContextRunner()
                .withInitializer(
                        new ConfigDataApplicationContextInitializer())
                .withPropertyValues("spring.profiles.active=prod")
                .withUserConfiguration(
                        SurveyOutboxConfigurationValidator.class,
                        OutboxEnabledProbeConfiguration.class);
    }

    private static final class OutboxEnabledProbe {
    }

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(
            prefix = "vote.integration.outbox",
            name = "dispatcher-enabled",
            havingValue = "true")
    static class OutboxEnabledProbeConfiguration {

        @Bean
        OutboxEnabledProbe outboxEnabledProbe() {
            return new OutboxEnabledProbe();
        }
    }
}
