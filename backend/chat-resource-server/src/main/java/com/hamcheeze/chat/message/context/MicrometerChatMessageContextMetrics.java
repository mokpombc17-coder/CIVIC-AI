package com.hamcheeze.chat.message.context;

import com.hamcheeze.chat.message.search.ChatMessageSearchErrorCode;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import java.time.Duration;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

public final class MicrometerChatMessageContextMetrics
        implements ChatMessageContextMetrics {

    private static final String REQUESTS =
            "chat.message.context.requests";
    private static final String DURATION =
            "chat.message.context.duration";
    private static final String FAILURES =
            "chat.message.context.failures";

    private final Counter requests;
    private final Timer duration;
    private final Map<ChatMessageSearchErrorCode, Counter> failures;

    public MicrometerChatMessageContextMetrics(
            MeterRegistry meterRegistry
    ) {
        MeterRegistry registry = Objects.requireNonNull(
                meterRegistry,
                "meterRegistry");
        this.requests = registry.counter(REQUESTS);
        this.duration = registry.timer(DURATION);
        this.failures = new EnumMap<>(ChatMessageSearchErrorCode.class);
        for (ChatMessageSearchErrorCode code
                : ChatMessageSearchErrorCode.values()) {
            failures.put(
                    code,
                    Counter.builder(FAILURES)
                            .tag("failure_kind", code.name())
                            .register(registry));
        }
    }

    @Override
    public void request() {
        BestEffortMetricRecorder.increment(REQUESTS, requests);
    }

    @Override
    public void success(Duration elapsed) {
        BestEffortMetricRecorder.record(DURATION, duration, elapsed);
    }

    @Override
    public void failure(
            ChatMessageSearchErrorCode code,
            Duration elapsed
    ) {
        BestEffortMetricRecorder.record(DURATION, duration, elapsed);
        BestEffortMetricRecorder.increment(
                FAILURES,
                failures.get(Objects.requireNonNull(code, "code")));
    }
}
