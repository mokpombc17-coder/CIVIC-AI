package com.hamcheeze.vote.persona.infra;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import java.util.concurrent.ThreadPoolExecutor;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(PersonaGenerationProperties.class)
class PersonaGenerationConfiguration {

    @Bean(name = "personaGenerationScheduler")
    @ConditionalOnProperty(prefix = "vote.persona", name = "enabled", havingValue = "true")
    ThreadPoolTaskScheduler personaGenerationScheduler(
            PersonaGenerationProperties properties
    ) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("persona-scheduler-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationMillis(
                properties.getWorkerShutdownAwait().toMillis());
        return scheduler;
    }

    @Bean(name = "personaGenerationExecutor")
    @ConditionalOnProperty(prefix = "vote.persona", name = "enabled", havingValue = "true")
    ThreadPoolTaskExecutor personaGenerationExecutor(
            PersonaGenerationProperties properties
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.getWorkerPoolSize());
        executor.setMaxPoolSize(properties.getWorkerPoolSize());
        executor.setQueueCapacity(properties.getWorkerQueueCapacity());
        executor.setThreadNamePrefix("persona-worker-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationMillis(
                properties.getWorkerShutdownAwait().toMillis());
        executor.setRejectedExecutionHandler(
                new ThreadPoolExecutor.AbortPolicy());
        return executor;
    }
}
