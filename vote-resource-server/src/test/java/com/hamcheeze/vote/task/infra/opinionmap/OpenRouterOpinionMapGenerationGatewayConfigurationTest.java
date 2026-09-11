package com.hamcheeze.vote.task.infra.opinionmap;

import com.hamcheeze.vote.task.application.port.out.OpinionMapGenerationGateway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

class OpenRouterOpinionMapGenerationGatewayConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withPropertyValues(
                            "vote.task.opinion-map.enabled=true",
                            "vote.task.opinion-map.provider=openrouter",
                            "vote.task.opinion-map.base-url=http://localhost",
                            "vote.task.opinion-map.api-key=test-key")
                    .withUserConfiguration(TestConfiguration.class);

    @Test
    void enabledOpenRouterProviderCreatesGateway() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(
                    OpenRouterOpinionMapGenerationGateway.class);
            assertThat(context).hasSingleBean(
                    OpinionMapGenerationGateway.class);
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(OpinionMapGenerationProperties.class)
    @Import(OpenRouterOpinionMapGenerationGateway.class)
    static class TestConfiguration {

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }
}
