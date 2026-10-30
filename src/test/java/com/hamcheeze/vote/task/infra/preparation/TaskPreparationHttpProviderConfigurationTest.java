package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.application.port.out.TaskPreparationProvider;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

class TaskPreparationHttpProviderConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withPropertyValues(
                            "vote.task.preparation.enabled=true",
                            "vote.task.preparation.provider=http",
                            "vote.task.preparation.base-url=https://civic-ai.co.kr")
                    .withUserConfiguration(TestConfiguration.class);

    @Test
    void enabledHttpProviderCreatesPreparationProvider() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(
                    TaskPreparationHttpProvider.class);
            assertThat(context).hasSingleBean(TaskPreparationProvider.class);
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(TaskPreparationProperties.class)
    @Import(TaskPreparationHttpProvider.class)
    static class TestConfiguration {

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }
}
