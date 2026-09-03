package com.hamcheeze.vote.survey.infra.bootstrap;

import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyBootstrapService;
import com.hamcheeze.vote.survey.application.consent.SurveyConsentService;
import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class LocalSurveyBootstrapConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withBean(
                            SurveyContentVersionRepository.class,
                            () -> mock(SurveyContentVersionRepository.class))
                    .withBean(
                            SurveyRoundRepository.class,
                            () -> mock(SurveyRoundRepository.class))
                    .withBean(
                            SurveyConsentService.class,
                            () -> mock(SurveyConsentService.class))
                    .withUserConfiguration(
                            LocalSurveyBootstrapService.class,
                            LocalSurveyBootstrapConfiguration.class);

    @Test
    void localProfileAndEnabledPropertyCreateRunner() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=local",
                        "vote.survey.bootstrap.enabled=true")
                .run(context -> {
                    assertThat(context)
                            .hasSingleBean(LocalSurveyBootstrapService.class);
                    assertThat(context).hasSingleBean(ApplicationRunner.class);
                });
    }

    @Test
    void localProfileWithoutOptInDoesNotCreateRunner() {
        contextRunner
                .withPropertyValues("spring.profiles.active=local")
                .run(context -> {
                    assertThat(context)
                            .hasSingleBean(LocalSurveyBootstrapService.class);
                    assertThat(context)
                            .doesNotHaveBean(ApplicationRunner.class);
                });
    }

    @Test
    void productionProfileNeverCreatesBootstrapBeans() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=prod",
                        "vote.survey.bootstrap.enabled=true")
                .run(context -> {
                    assertThat(context)
                            .doesNotHaveBean(LocalSurveyBootstrapService.class);
                    assertThat(context)
                            .doesNotHaveBean(ApplicationRunner.class);
                });
    }
}
