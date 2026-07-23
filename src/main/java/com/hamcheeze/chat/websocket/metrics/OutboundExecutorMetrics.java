package com.hamcheeze.chat.websocket.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

@Component
public final class OutboundExecutorMetrics
        implements SmartInitializingSingleton {

    private final ThreadPoolTaskExecutor executor;
    private final MeterRegistry meterRegistry;

    public OutboundExecutorMetrics(
            @Qualifier("chatClientOutboundExecutor")
            ThreadPoolTaskExecutor executor,
            MeterRegistry meterRegistry
    ) {
        this.executor = executor;
        this.meterRegistry = meterRegistry;
    }

    @Override
    public void afterSingletonsInstantiated() {
        Gauge.builder(
                        "client_outbound_channel.queue_size",
                        executor,
                        value -> value.getThreadPoolExecutor()
                                .getQueue()
                                .size())
                .register(meterRegistry);
    }
}
