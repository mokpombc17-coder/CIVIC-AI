package com.hamcheeze.chat.message.outbox;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatMessageOutboxMetricsSamplerTest {

    private static final Instant NOW =
            Instant.parse("2026-07-30T05:00:00Z");

    @Test
    void samplesPendingOldestAgeAndUnsupportedCounts() {
        ChatMessageOutboxMonitor monitor =
                mock(ChatMessageOutboxMonitor.class);
        when(monitor.sample()).thenReturn(
                new ChatMessageOutboxBacklogSnapshot(
                        3,
                        NOW.minusSeconds(12),
                        1));
        SimpleMeterRegistry meterRegistry =
                new SimpleMeterRegistry();
        ChatMessageOutboxMetricsSampler sampler =
                new ChatMessageOutboxMetricsSampler(
                        monitor,
                        meterRegistry);

        sampler.sample(NOW);

        assertThat(gauge(meterRegistry, "chat.outbox.pending"))
                .isEqualTo(3);
        assertThat(gauge(
                meterRegistry,
                "chat.outbox.oldest.pending.age.seconds"))
                .isEqualTo(12);
        assertThat(gauge(meterRegistry, "chat.outbox.unsupported"))
                .isEqualTo(1);
    }

    @Test
    void emptyOutboxHasZeroOldestAge() {
        ChatMessageOutboxMonitor monitor =
                mock(ChatMessageOutboxMonitor.class);
        when(monitor.sample()).thenReturn(
                new ChatMessageOutboxBacklogSnapshot(0, null, 0));
        SimpleMeterRegistry meterRegistry =
                new SimpleMeterRegistry();
        ChatMessageOutboxMetricsSampler sampler =
                new ChatMessageOutboxMetricsSampler(
                        monitor,
                        meterRegistry);

        sampler.sample(NOW);

        assertThat(gauge(
                meterRegistry,
                "chat.outbox.oldest.pending.age.seconds"))
                .isZero();
    }

    @Test
    void sampleFailureKeepsLastSuccessfulValues() {
        ChatMessageOutboxMonitor monitor =
                mock(ChatMessageOutboxMonitor.class);
        when(monitor.sample())
                .thenReturn(new ChatMessageOutboxBacklogSnapshot(
                        2,
                        NOW.minusSeconds(7),
                        1))
                .thenThrow(new IllegalStateException("Mongo unavailable"));
        SimpleMeterRegistry meterRegistry =
                new SimpleMeterRegistry();
        ChatMessageOutboxMetricsSampler sampler =
                new ChatMessageOutboxMetricsSampler(
                        monitor,
                        meterRegistry);

        sampler.sample(NOW);
        sampler.sample(NOW.plusSeconds(5));

        assertThat(gauge(meterRegistry, "chat.outbox.pending"))
                .isEqualTo(2);
        assertThat(gauge(
                meterRegistry,
                "chat.outbox.oldest.pending.age.seconds"))
                .isEqualTo(7);
        assertThat(gauge(meterRegistry, "chat.outbox.unsupported"))
                .isEqualTo(1);
        assertThat(meterRegistry.counter(
                "chat.outbox.monitor.sample.failures").count())
                .isEqualTo(1);
    }

    private double gauge(
            SimpleMeterRegistry meterRegistry,
            String name
    ) {
        return meterRegistry.get(name).gauge().value();
    }
}
