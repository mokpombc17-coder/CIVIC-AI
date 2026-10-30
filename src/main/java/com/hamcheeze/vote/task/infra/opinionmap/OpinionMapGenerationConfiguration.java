package com.hamcheeze.vote.task.infra.opinionmap;

import com.hamcheeze.vote.task.application.opinionmap.OpinionMapGenerationPolicy;
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
@EnableConfigurationProperties(OpinionMapGenerationProperties.class)
class OpinionMapGenerationConfiguration {

    @Bean
    OpinionMapGenerationPolicy opinionMapGenerationPolicy(
            OpinionMapGenerationProperties properties
    ) {
        return new OpinionMapGenerationPolicy(
                properties.isEnabled(),
                properties.getPromptVersion(),
                properties.getRequestTimeout(),
                properties.getMaximumAttempts(),
                properties.getRetryDelay(),
                properties.getProcessingLeaseDuration(),
                properties.getBatchSize());
    }

    @Bean(name = "opinionMapGenerationExecutor")
    @ConditionalOnProperty(
            prefix = "vote.task.opinion-map",
            name = "enabled",
            havingValue = "true")
    ThreadPoolTaskExecutor opinionMapGenerationExecutor(
            OpinionMapGenerationProperties properties
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.getWorkerPoolSize());
        executor.setMaxPoolSize(properties.getWorkerPoolSize());
        executor.setQueueCapacity(properties.getWorkerQueueCapacity());
        executor.setThreadNamePrefix("opinion-map-worker-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(toSeconds(
                properties.getWorkerShutdownAwait()));
        executor.setRejectedExecutionHandler(
                new ThreadPoolExecutor.AbortPolicy());
        return executor;
    }

    @Bean(name = "opinionMapGenerationTaskScheduler")
    @ConditionalOnProperty(
            prefix = "vote.task.opinion-map",
            name = "enabled",
            havingValue = "true")
    ThreadPoolTaskScheduler opinionMapGenerationTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("opinion-map-scheduler-");
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        return scheduler;
    }

    private static int toSeconds(java.time.Duration duration) {
        long seconds = duration == null ? 0 : duration.toSeconds();
        return (int) Math.min(Integer.MAX_VALUE, Math.max(0, seconds));
    }
}
