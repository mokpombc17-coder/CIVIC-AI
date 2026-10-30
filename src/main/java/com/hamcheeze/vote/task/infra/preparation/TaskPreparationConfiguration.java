package com.hamcheeze.vote.task.infra.preparation;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationPolicy;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TaskPreparationProperties.class)
class TaskPreparationConfiguration {

    @Bean
    TaskPreparationPolicy taskPreparationPolicy(
            TaskPreparationProperties properties
    ) {
        return new TaskPreparationPolicy(
                properties.getRetryDelay(),
                properties.getProcessingLeaseDuration());
    }
}
