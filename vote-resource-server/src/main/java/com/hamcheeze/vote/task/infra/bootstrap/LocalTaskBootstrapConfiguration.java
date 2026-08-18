package com.hamcheeze.vote.task.infra.bootstrap;

import com.hamcheeze.vote.task.application.bootstrap.LocalTaskBootstrapService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("local")
@ConditionalOnProperty(
        name = "vote.task.bootstrap.enabled",
        havingValue = "true")
public class LocalTaskBootstrapConfiguration {

    @Bean
    ApplicationRunner localTaskBootstrapRunner(
            LocalTaskBootstrapService bootstrap
    ) {
        return arguments -> bootstrap.initialize();
    }
}
