package com.hamcheeze.chat.message.search;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class MicrometerChatMessageSearchMetricsTest {

    @Test
    void recordsOnlyBoundedLowCardinalitySearchMetrics() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MicrometerChatMessageSearchMetrics metrics =
                new MicrometerChatMessageSearchMetrics(registry);

        metrics.request();
        metrics.rateLimited();
        metrics.deadlineReached();
        metrics.success(5, 2, true, Duration.ofMillis(20));
        metrics.failure(
                ChatMessageSearchErrorCode.MESSAGE_SEARCH_UNAVAILABLE,
                3,
                1,
                Duration.ofMillis(10));

        assertCounter(registry, "chat.message.search.requests", 1);
        assertCounter(registry, "chat.message.search.rate_limited", 1);
        assertCounter(registry, "chat.message.search.deadline_reached", 1);
        assertCounter(registry, "chat.message.search.scanned", 8);
        assertCounter(registry, "chat.message.search.matches", 3);
        assertCounter(registry, "chat.message.search.pages", 1);
        assertCounter(registry, "chat.message.search.completed", 1);
        assertThat(registry.get("chat.message.search.failures")
                .tag(
                        "failure_kind",
                        "MESSAGE_SEARCH_UNAVAILABLE")
                .counter()
                .count()).isEqualTo(1);
        assertThat(registry.get("chat.message.search.duration")
                .timer().count()).isEqualTo(2);
        assertThat(registry.getMeters())
                .flatExtracting(meter -> meter.getId().getTags())
                .noneMatch(tag -> tag.getKey().equals("roomId")
                        || tag.getKey().equals("userId")
                        || tag.getKey().equals("membershipId")
                        || tag.getKey().equals("query"));
    }

    private void assertCounter(
            SimpleMeterRegistry registry,
            String name,
            double expected
    ) {
        assertThat(registry.get(name).counter().count())
                .isEqualTo(expected);
    }
}
