package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.persistence.RoomCommandType;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import java.time.Duration;
import java.util.Objects;
import java.util.function.Supplier;

public final class ActiveRoomMembershipQuotaMetrics {

    private static final String REJECTED_METRIC =
            "room.membership.user_active_limit.rejected";
    private static final String EXEMPTED_METRIC =
            "room.membership.user_active_limit.exempted";
    private static final String DURATION_METRIC =
            "room.membership.user_active_limit.check.duration";

    private final MeterRegistry meterRegistry;

    public ActiveRoomMembershipQuotaMetrics(
            MeterRegistry meterRegistry
    ) {
        this.meterRegistry = Objects.requireNonNull(
                meterRegistry,
                "meterRegistry");
    }

    public ActiveRoomMembershipQuotaDecision recordCheck(
            RoomCommandType operation,
            Supplier<ActiveRoomMembershipQuotaDecision> action
    ) {
        Objects.requireNonNull(operation, "operation");
        Objects.requireNonNull(action, "action");
        long startedAt = System.nanoTime();
        try {
            ActiveRoomMembershipQuotaDecision decision = action.get();
            if (decision
                    == ActiveRoomMembershipQuotaDecision.LIMIT_REACHED) {
                increment(REJECTED_METRIC, operation);
            }
            return decision;
        } finally {
            recordDuration(operation, System.nanoTime() - startedAt);
        }
    }

    public void recordExempted(RoomCommandType operation) {
        increment(EXEMPTED_METRIC, operation);
    }

    private void increment(
            String metricName,
            RoomCommandType operation
    ) {
        if (meterRegistry == null) {
            return;
        }
        try {
            meterRegistry.counter(
                    metricName,
                    "operation",
                    operation.name()).increment();
        } catch (RuntimeException ignored) {
            // Metrics must never change the command result.
        }
    }

    private void recordDuration(
            RoomCommandType operation,
            long elapsedNanos
    ) {
        if (meterRegistry == null) {
            return;
        }
        try {
            Timer.builder(DURATION_METRIC)
                    .tag("operation", operation.name())
                    .register(meterRegistry)
                    .record(Duration.ofNanos(elapsedNanos));
        } catch (RuntimeException ignored) {
            // Metrics must never change the command result.
        }
    }
}
