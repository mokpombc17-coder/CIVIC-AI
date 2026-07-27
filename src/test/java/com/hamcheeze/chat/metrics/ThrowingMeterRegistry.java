package com.hamcheeze.chat.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import java.time.Duration;

import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;

public final class ThrowingMeterRegistry {

    private ThrowingMeterRegistry() {
    }

    public static SimpleMeterRegistry counter(String... metricNames) {
        SimpleMeterRegistry registry =
                spy(new SimpleMeterRegistry());
        Counter counter = throwingCounter();
        for (String metricName : metricNames) {
            doReturn(counter).when(registry).counter(metricName);
        }
        return registry;
    }

    public static SimpleMeterRegistry timer(String metricName) {
        SimpleMeterRegistry registry =
                spy(new SimpleMeterRegistry());
        Timer timer = mock(Timer.class);
        doThrow(metricFailure()).when(timer)
                .record(org.mockito.ArgumentMatchers.any(
                        Duration.class));
        doReturn(timer).when(registry).timer(metricName);
        return registry;
    }

    public static SimpleMeterRegistry counterAndTimer(
            String counterName,
            String timerName
    ) {
        SimpleMeterRegistry registry = counter(counterName);
        Timer timer = throwingTimer();
        doReturn(timer).when(registry).timer(timerName);
        return registry;
    }

    public static Counter throwingCounter() {
        Counter counter = mock(Counter.class);
        doThrow(metricFailure()).when(counter).increment();
        doThrow(metricFailure()).when(counter)
                .increment(anyDouble());
        return counter;
    }

    public static Timer throwingTimer() {
        Timer timer = mock(Timer.class);
        doThrow(metricFailure()).when(timer)
                .record(org.mockito.ArgumentMatchers.any(
                        Duration.class));
        return timer;
    }

    private static RuntimeException metricFailure() {
        return new IllegalStateException("metric write failed");
    }
}
