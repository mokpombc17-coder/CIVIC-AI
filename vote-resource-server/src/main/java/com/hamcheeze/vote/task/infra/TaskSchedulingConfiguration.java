package com.hamcheeze.vote.task.infra;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
public class TaskSchedulingConfiguration {

    @Bean(name = "taskLifecycleTaskScheduler")
    ThreadPoolTaskScheduler taskLifecycleTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("task-lifecycle-");
        scheduler.setWaitForTasksToCompleteOnShutdown(false);
        return scheduler;
    }
}
