package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.port.out.PredictionCreationPort;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

class TaskPredictionHttpCreationAdapterConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withPropertyValues(
                            "vote.task.prediction.enabled=true",
                            "vote.task.prediction.provider=http",
                            "vote.task.prediction.base-url=https://civic-ai.co.kr")
                    .withUserConfiguration(TestConfiguration.class);

    @Test
    void enabledHttpProviderCreatesPredictionAdapter() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(
                    TaskPredictionHttpCreationAdapter.class);
            assertThat(context).hasSingleBean(PredictionCreationPort.class);
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(TaskPredictionProperties.class)
    @Import(TaskPredictionHttpCreationAdapter.class)
    static class TestConfiguration {

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }
}
