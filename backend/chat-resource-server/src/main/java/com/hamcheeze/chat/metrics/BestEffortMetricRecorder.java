package com.hamcheeze.chat.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;

public final class BestEffortMetricRecorder {

    private static final Logger log = LoggerFactory.getLogger(
            BestEffortMetricRecorder.class);

    private BestEffortMetricRecorder() {
    }

    public static void increment(
            String metricName,
            Counter counter
    ) {
        try {
            counter.increment();
        } catch (RuntimeException exception) {
            warn(metricName, null, exception);
        }
    }

    public static void increment(
            String metricName,
            Counter counter,
            double amount
    ) {
        try {
            counter.increment(amount);
        } catch (RuntimeException exception) {
            warn(metricName, amount, exception);
        }
    }

    public static void record(
            String metricName,
            Timer timer,
            Duration duration
    ) {
        try {
            timer.record(duration);
        } catch (RuntimeException exception) {
            warn(metricName, null, exception);
        }
    }

    private static void warn(
            String metricName,
            Double amount,
            RuntimeException exception
    ) {
        try {
            if (amount == null) {
                log.warn(
                        "Metric write failed: metricName={}",
                        metricName,
                        exception);
            } else {
                log.warn(
                        "Metric write failed: metricName={}, amount={}",
                        metricName,
                        amount,
                        exception);
            }
        } catch (RuntimeException ignored) {
            // Observability failures must not affect business processing.
        }
    }
}
