package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import java.time.Duration;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

public final class MicrometerChatMessageSearchMetrics
        implements ChatMessageSearchMetrics {

    private static final String REQUESTS =
            "chat.message.search.requests";
    private static final String DURATION =
            "chat.message.search.duration";
    private static final String SCANNED =
            "chat.message.search.scanned";
    private static final String MATCHES =
            "chat.message.search.matches";
    private static final String PAGES =
            "chat.message.search.pages";
    private static final String COMPLETED =
            "chat.message.search.completed";
    private static final String EMPTY_PAGES =
            "chat.message.search.empty_pages";
    private static final String DEADLINE_REACHED =
            "chat.message.search.deadline_reached";
    private static final String RATE_LIMITED =
            "chat.message.search.rate_limited";
    private static final String FAILURES =
            "chat.message.search.failures";

    private final Counter requests;
    private final Timer duration;
    private final Counter scanned;
    private final Counter matches;
    private final Counter pages;
    private final Counter completed;
    private final Counter emptyPages;
    private final Counter deadlineReached;
    private final Counter rateLimited;
    private final Map<ChatMessageSearchErrorCode, Counter> failures;

    public MicrometerChatMessageSearchMetrics(
            MeterRegistry meterRegistry
    ) {
        MeterRegistry registry = Objects.requireNonNull(
                meterRegistry,
                "meterRegistry");
        this.requests = registry.counter(REQUESTS);
        this.duration = registry.timer(DURATION);
        this.scanned = registry.counter(SCANNED);
        this.matches = registry.counter(MATCHES);
        this.pages = registry.counter(PAGES);
        this.completed = registry.counter(COMPLETED);
        this.emptyPages = registry.counter(EMPTY_PAGES);
        this.deadlineReached = registry.counter(DEADLINE_REACHED);
        this.rateLimited = registry.counter(RATE_LIMITED);
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
        increment(REQUESTS, requests);
    }

    @Override
    public void rateLimited() {
        increment(RATE_LIMITED, rateLimited);
    }

    @Override
    public void deadlineReached() {
        increment(DEADLINE_REACHED, deadlineReached);
    }

    @Override
    public void success(
            int scannedCount,
            int matchCount,
            boolean searchComplete,
            Duration elapsed
    ) {
        recordWork(scannedCount, matchCount, elapsed);
        increment(PAGES, pages);
        if (searchComplete) {
            increment(COMPLETED, completed);
        }
        if (matchCount == 0) {
            increment(EMPTY_PAGES, emptyPages);
        }
    }

    @Override
    public void failure(
            ChatMessageSearchErrorCode code,
            int scannedCount,
            int matchCount,
            Duration elapsed
    ) {
        Objects.requireNonNull(code, "code");
        recordWork(scannedCount, matchCount, elapsed);
        increment(FAILURES, failures.get(code));
    }

    private void recordWork(
            int scannedCount,
            int matchCount,
            Duration elapsed
    ) {
        if (scannedCount > 0) {
            increment(SCANNED, scanned, scannedCount);
        }
        if (matchCount > 0) {
            increment(MATCHES, matches, matchCount);
        }
        BestEffortMetricRecorder.record(DURATION, duration, elapsed);
    }

    private void increment(String name, Counter counter) {
        BestEffortMetricRecorder.increment(name, counter);
    }

    private void increment(
            String name,
            Counter counter,
            double amount
    ) {
        BestEffortMetricRecorder.increment(name, counter, amount);
    }
}
