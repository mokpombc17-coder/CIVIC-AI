package com.hamcheeze.vote.persona.infra;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class PersonaProductionConfigurationResolutionTest {

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withInitializer(
                            new ConfigDataApplicationContextInitializer())
                    .withUserConfiguration(PropertiesConfiguration.class)
                    .withPropertyValues("spring.profiles.active=prod");

    @Test
    void productionProfileStillResolvesLegacyPersonaEnvironmentAliases() {
        runner.withPropertyValues(
                        "VOTE_SURVEY_PERSONA_ENABLED=true",
                        "VOTE_SURVEY_PERSONA_PROVIDER=http",
                        "VOTE_SURVEY_PERSONA_BASE_URL=https://legacy.example",
                        "VOTE_SURVEY_PERSONA_AUTH_TOKEN=legacy-token",
                        "VOTE_SURVEY_PERSONA_DISPATCHER_DELAY=17s")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    PersonaGenerationProperties properties =
                            context.getBean(PersonaGenerationProperties.class);
                    assertThat(properties.isEnabled()).isTrue();
                    assertThat(properties.getProvider()).isEqualTo("http");
                    assertThat(properties.getBaseUrl())
                            .isEqualTo("https://legacy.example");
                    assertThat(properties.getAuthToken())
                            .isEqualTo("legacy-token");
                    assertThat(properties.getDispatcherDelay())
                            .hasSeconds(17);
                });
    }

    @Test
    void authoritativeProductionKeysOverrideLegacyAliases() {
        runner.withPropertyValues(
                        "VOTE_PERSONA_BASE_URL=https://new.example",
                        "VOTE_SURVEY_PERSONA_BASE_URL=https://old.example",
                        "VOTE_PERSONA_PROVIDER=http",
                        "VOTE_SURVEY_PERSONA_PROVIDER=fake")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    PersonaGenerationProperties properties =
                            context.getBean(PersonaGenerationProperties.class);
                    assertThat(properties.getBaseUrl())
                            .isEqualTo("https://new.example");
                    assertThat(properties.getProvider()).isEqualTo("http");
                });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(PersonaGenerationProperties.class)
    static class PropertiesConfiguration {
    }
}
