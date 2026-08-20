package com.hamcheeze.vote.survey.infra.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SurveyOutboxConfigurationValidatorTest {

    @Test
    void rejectsDisabledOutboxInProduction() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        SurveyOutboxConfigurationValidator validator =
                new SurveyOutboxConfigurationValidator(environment, false);

        assertThatThrownBy(validator::afterSingletonsInstantiated)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("vote.integration.outbox.enabled=false")
                .hasMessageContaining("SurveyResponseSubmitted")
                .hasMessageContaining(
                        "vote.integration.outbox.enabled=true");
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
    void productionProfileEnablesOutboxByDefault() {
        productionContext().run(context -> {
            assertThatCode(() -> context.getBean(
                    OutboxEnabledProbe.class))
                    .doesNotThrowAnyException();
            org.assertj.core.api.Assertions.assertThat(context)
                    .hasNotFailed()
                    .hasSingleBean(OutboxEnabledProbe.class);
        });
    }

    @Test
    void productionContextFailsWhenOutboxIsExplicitlyDisabled() {
        productionContext()
                .withPropertyValues(
                        "vote.integration.outbox.enabled=false")
                .run(context -> org.assertj.core.api.Assertions
                        .assertThat(context)
                        .hasFailed()
                        .getFailure()
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining(
                                "vote.integration.outbox.enabled=true"));
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
            name = "enabled",
            havingValue = "true")
    static class OutboxEnabledProbeConfiguration {

        @Bean
        OutboxEnabledProbe outboxEnabledProbe() {
            return new OutboxEnabledProbe();
        }
    }
}
