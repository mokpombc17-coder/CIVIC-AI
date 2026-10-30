package com.hamcheeze.chat.websocket.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SubProtocolWebSocketHandler;

@Component
public final class SpringWebSocketStatsMetrics
        implements SmartInitializingSingleton {

    private final ApplicationContext applicationContext;
    private final MeterRegistry meterRegistry;

    public SpringWebSocketStatsMetrics(
            ApplicationContext applicationContext,
            MeterRegistry meterRegistry
    ) {
        this.applicationContext = applicationContext;
        this.meterRegistry = meterRegistry;
    }

    @Override
    public void afterSingletonsInstantiated() {
        Object bean = applicationContext.getBean("subProtocolWebSocketHandler");
        if (!(bean instanceof SubProtocolWebSocketHandler handler)) {
            throw new IllegalStateException(
                    "subProtocolWebSocketHandler has unexpected type: "
                            + bean.getClass().getName());
        }
        Gauge.builder(
                        "websocket.send_limit_exceeded",
                        handler,
                        value -> value.getStats().getLimitExceededSessions())
                .register(meterRegistry);
        Gauge.builder(
                        "websocket.transport_errors",
                        handler,
                        value -> value.getStats().getTransportErrorSessions())
                .register(meterRegistry);
    }
}
