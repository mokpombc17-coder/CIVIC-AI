package com.hamcheeze.vote.task.infra.bootstrap;

import com.hamcheeze.vote.task.application.bootstrap.LocalTaskBootstrapService;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class LocalTaskBootstrapConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withBean(
                            TaskRepository.class,
                            () -> mock(TaskRepository.class))
                    .withUserConfiguration(
                            LocalTaskBootstrapService.class,
                            LocalTaskBootstrapConfiguration.class);

    @Test
    void localProfileAndEnabledPropertyCreateRunner() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=local",
                        "vote.task.bootstrap.enabled=true")
                .run(context -> {
                    assertThat(context)
                            .hasSingleBean(LocalTaskBootstrapService.class);
                    assertThat(context)
                            .hasSingleBean(ApplicationRunner.class);
                });
    }

    @Test
    void localProfileWithoutOptInDoesNotCreateRunner() {
        contextRunner
                .withPropertyValues("spring.profiles.active=local")
                .run(context -> {
                    assertThat(context)
                            .hasSingleBean(LocalTaskBootstrapService.class);
                    assertThat(context)
                            .doesNotHaveBean(ApplicationRunner.class);
                });
    }

    @Test
    void productionProfileNeverCreatesBootstrapBeans() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=prod",
                        "vote.task.bootstrap.enabled=true")
                .run(context -> {
                    assertThat(context)
                            .doesNotHaveBean(LocalTaskBootstrapService.class);
                    assertThat(context)
                            .doesNotHaveBean(ApplicationRunner.class);
                });
    }
}
