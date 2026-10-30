package com.hamcheeze.vote.persona.infra;

import com.hamcheeze.vote.persona.application.PersonaGenerationDispatcher;
import com.hamcheeze.vote.persona.application.PersonaGenerationLeaseReaper;
import com.hamcheeze.vote.persona.application.PersonaGenerationWorker;
import com.hamcheeze.vote.persona.application.port.out.PersonaCreationPort;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

class PersonaProviderConfigurationTest {

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            PersonaProviderConfiguration.class,
                            PersonaGenerationConfiguration.class,
                            PersonaGenerationWorker.class,
                            PersonaGenerationDispatcher.class,
                            PersonaGenerationLeaseReaper.class)
                    .withBean(PersonaGenerationProperties.class)
                    .withBean(ObjectMapper.class);

    @Test
    void disabledPersonaCreatesNoProviderWorkerPollerSchedulerOrExecutor() {
        runner.withPropertyValues(
                        "vote.persona.enabled=false",
                        "vote.persona.provider=http",
                        "vote.persona.base-url=")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(
                            PersonaCreationPort.class);
                    assertThat(context).doesNotHaveBean(
                            PersonaGenerationWorker.class);
                    assertThat(context).doesNotHaveBean(
                            PersonaGenerationDispatcher.class);
                    assertThat(context).doesNotHaveBean(
                            PersonaGenerationLeaseReaper.class);
                    assertThat(context).doesNotHaveBean(
                            "personaGenerationScheduler");
                    assertThat(context).doesNotHaveBean(
                            "personaGenerationExecutor");
                });
    }

    @Test
    void disabledFakeProviderAlsoCreatesNoAdapter() {
        runner.withPropertyValues(
                        "vote.persona.enabled=false",
                        "vote.persona.provider=fake")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(
                            PersonaCreationPort.class);
                });
    }

    @Test
    void enabledLocalFakeProviderCreatesOnlyTheFakeAdapter() {
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment()
                        .setActiveProfiles("local"))
                .withUserConfiguration(PersonaProviderConfiguration.class)
                .withBean(PersonaGenerationProperties.class)
                .withBean(ObjectMapper.class)
                .withPropertyValues(
                        "vote.persona.enabled=true",
                        "vote.persona.provider=fake")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(PersonaCreationPort.class);
                    assertThat(context.getBean(PersonaCreationPort.class))
                            .isInstanceOf(LocalPersonaFakeCreationAdapter.class);
                });
    }

    @Test
    void enabledHttpProviderCreatesTheHttpAdapter() {
        new ApplicationContextRunner()
                .withUserConfiguration(PersonaProviderConfiguration.class)
                .withBean(PersonaGenerationProperties.class,
                        () -> {
                            PersonaGenerationProperties properties =
                                    new PersonaGenerationProperties();
                            properties.setEnabled(true);
                            properties.setProvider("http");
                            properties.setBaseUrl("https://persona.example");
                            return properties;
                        })
                .withBean(ObjectMapper.class)
                .withPropertyValues(
                        "vote.persona.enabled=true",
                        "vote.persona.provider=http")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(PersonaCreationPort.class);
                    assertThat(context.getBean(PersonaCreationPort.class))
                            .isInstanceOf(PersonaHttpCreationAdapter.class);
                });
    }
}
