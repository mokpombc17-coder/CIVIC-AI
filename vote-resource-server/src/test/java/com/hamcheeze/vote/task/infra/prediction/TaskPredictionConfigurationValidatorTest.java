package com.hamcheeze.vote.task.infra.prediction;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskPredictionConfigurationValidatorTest {

    @Test
    void disabledFeatureDoesNotValidateProviderOrWorkerSettings() {
        TaskPredictionProperties properties = new TaskPredictionProperties();
        properties.setEnabled(false);
        properties.setBaseUrl("");
        properties.setWorkerPoolSize(0);

        assertThatCode(() -> validator(properties, "prod")
                .afterPropertiesSet()).doesNotThrowAnyException();
    }

    @Test
    void enabledProductionRequiresSafeHttpProviderUrl() {
        TaskPredictionProperties properties = valid();
        properties.setBaseUrl("http://[::1]");

        assertThatThrownBy(() -> validator(properties, "prod")
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("vote.task.prediction.base-url")
                .hasMessageContaining("loopback");
    }

    @Test
    void processingLeaseMustExceedRequestTimeout() {
        TaskPredictionProperties properties = valid();
        properties.setRequestTimeout(Duration.ofSeconds(30));
        properties.setProcessingLeaseDuration(Duration.ofSeconds(30));

        assertThatThrownBy(() -> validator(properties, "local")
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "vote.task.prediction.processing-lease-duration");
    }

    @Test
    void providerValuesMustUseExactLowercaseContract() {
        TaskPredictionProperties uppercase = valid();
        uppercase.setProvider("HTTP");
        TaskPredictionProperties mixedCase = valid();
        mixedCase.setProvider("Fake");

        assertThatThrownBy(() -> validator(uppercase, "local")
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("vote.task.prediction.provider")
                .hasMessageContaining("allowed values: http, fake")
                .hasMessageContaining("lowercase");
        assertThatThrownBy(() -> validator(mixedCase, "local")
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("lowercase");
    }

    @Test
    void productionStillRejectsExactLowercaseFakeProvider() {
        TaskPredictionProperties properties = valid();
        properties.setProvider("fake");

        assertThatThrownBy(() -> validator(properties, "prod")
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("allowed values: http")
                .hasMessageContaining("lowercase");
    }

    private static TaskPredictionProperties valid() {
        TaskPredictionProperties properties = new TaskPredictionProperties();
        properties.setEnabled(true);
        properties.setProvider("http");
        properties.setBaseUrl("https://prediction.example.test");
        return properties;
    }

    private static TaskPredictionConfigurationValidator validator(
            TaskPredictionProperties properties,
            String profile
    ) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        return new TaskPredictionConfigurationValidator(
                properties, environment);
    }
}
