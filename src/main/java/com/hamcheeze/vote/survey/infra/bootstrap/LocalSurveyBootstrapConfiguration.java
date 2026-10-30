package com.hamcheeze.vote.survey.infra.bootstrap;

import com.hamcheeze.vote.survey.application.bootstrap.LocalSurveyBootstrapService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("local")
@ConditionalOnProperty(
        name = "vote.survey.bootstrap.enabled",
        havingValue = "true")
public class LocalSurveyBootstrapConfiguration {

    @Bean
    ApplicationRunner localSurveyBootstrapRunner(
            LocalSurveyBootstrapService bootstrap
    ) {
        return arguments -> bootstrap.initialize();
    }
}
