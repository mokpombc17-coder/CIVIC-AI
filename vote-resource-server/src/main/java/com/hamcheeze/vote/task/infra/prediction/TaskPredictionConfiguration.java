package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.prediction.TaskPredictionApplicationPolicy;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(TaskPredictionProperties.class)
class TaskPredictionConfiguration {

    @Bean
    TaskPredictionApplicationPolicy taskPredictionApplicationPolicy(
            TaskPredictionProperties properties
    ) {
        return new TaskPredictionApplicationPolicy(
                properties.getCandidatePolicyVersion(),
                properties.getRequestedCandidateCount(),
                new TaskPredictionRetryPolicy(
                        properties.getRequestTimeout(),
                        properties.getMaximumAttempts(),
                        properties.getRetryDelay()),
                properties.getBatchSize());
    }
}
