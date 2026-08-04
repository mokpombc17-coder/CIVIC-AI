package com.hamcheeze.chat.websocket.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.validation.BindValidationException;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class SubscriptionLimitPropertiesTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            SubscriptionPropertiesConfiguration.class);

    @Test
    void defaultsToSixSubscriptionsPerConnection() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(
                    SubscriptionLimitProperties.class)
                    .getMaxSubscriptionsPerConnection())
                    .isEqualTo(6);
        });
    }

    @Test
    void acceptsFiveAsMinimum() {
        contextRunner
                .withPropertyValues(
                        "chat.websocket.subscription."
                                + "max-subscriptions-per-connection=5")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(
                            SubscriptionLimitProperties.class)
                            .getMaxSubscriptionsPerConnection())
                            .isEqualTo(5);
                });
    }

    @Test
    void rejectsValuesBelowFiveDuringStartupBinding() {
        assertInvalid("4");
        assertInvalid("1");
    }

    private void assertInvalid(String value) {
        contextRunner
                .withPropertyValues(
                        "chat.websocket.subscription."
                                + "max-subscriptions-per-connection="
                                + value)
                .run(context -> {
                    assertThat(context).hasFailed();
                    Throwable rootCause = rootCause(
                            context.getStartupFailure());
                    assertThat(rootCause)
                            .isInstanceOf(BindValidationException.class)
                            .hasMessageContaining(
                                    "maxSubscriptionsPerConnection");
                });
    }

    private Throwable rootCause(Throwable failure) {
        Throwable cause = failure;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(
            SubscriptionLimitProperties.class)
    static class SubscriptionPropertiesConfiguration {
    }
}
