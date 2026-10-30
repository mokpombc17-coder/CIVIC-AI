package com.hamcheeze.chat.websocket.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
public class WebSocketInfrastructureConfiguration {

    @Bean("chatWebSocketTaskScheduler")
    ThreadPoolTaskScheduler chatWebSocketTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("chat-ws-heartbeat-");
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }

    @Bean("chatClientOutboundExecutor")
    ThreadPoolTaskExecutor chatClientOutboundExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(1_000);
        executor.setThreadNamePrefix("chat-client-outbound-");
        return executor;
    }
}
