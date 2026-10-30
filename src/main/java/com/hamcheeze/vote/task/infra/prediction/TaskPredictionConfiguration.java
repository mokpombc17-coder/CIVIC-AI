package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.application.prediction.TaskPredictionApplicationPolicy;
import com.hamcheeze.vote.task.application.prediction.TaskPredictionAvailability;
import com.hamcheeze.vote.task.domain.prediction.TaskPredictionRetryPolicy;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({
        TaskPredictionProperties.class,
        LocalTaskPredictionProperties.class
})
class TaskPredictionConfiguration {

    @Bean
    TaskPredictionAvailability taskPredictionAvailability(
            TaskPredictionProperties properties
    ) {
        return new TaskPredictionAvailability(properties.isEnabled());
    }

    @Bean
    @ConditionalOnProperty(
            prefix = "vote.task.prediction", name = "enabled",
            havingValue = "true")
    TaskPredictionApplicationPolicy taskPredictionApplicationPolicy(
            TaskPredictionProperties properties
    ) {
        return new TaskPredictionApplicationPolicy(
                properties.getCandidatePolicyVersion(),
                new TaskPredictionRetryPolicy(
                        properties.getRequestTimeout(),
                        properties.getMaximumAttempts(),
                        properties.getRetryDelay()),
                properties.getProcessingLeaseDuration(),
                properties.getBatchSize());
    }

    @Bean(name = "taskPredictionExecutor")
    @ConditionalOnProperty(
            prefix = "vote.task.prediction", name = "enabled",
            havingValue = "true")
    ThreadPoolTaskExecutor taskPredictionExecutor(
            TaskPredictionProperties properties
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.getWorkerPoolSize());
        executor.setMaxPoolSize(properties.getWorkerPoolSize());
        executor.setQueueCapacity(properties.getWorkerQueueCapacity());
        executor.setThreadNamePrefix("task-prediction-worker-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(toSeconds(
                properties.getWorkerShutdownAwait()));
        executor.setRejectedExecutionHandler(
                new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
        return executor;
    }

    @Bean(name = "taskPredictionTaskScheduler")
    @ConditionalOnProperty(
            prefix = "vote.task.prediction", name = "enabled",
            havingValue = "true")
    ThreadPoolTaskScheduler taskPredictionTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("task-prediction-scheduler-");
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        return scheduler;
    }

    private static int toSeconds(java.time.Duration duration) {
        long seconds = duration == null ? 0 : duration.toSeconds();
        return (int) Math.min(Integer.MAX_VALUE, Math.max(0, seconds));
    }
}
