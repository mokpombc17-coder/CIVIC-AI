package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.health.contributor.Status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatMessageOutboxMetricsSamplingLifecycleTest {

    private static final Instant NOW =
            Instant.parse("2026-07-31T00:00:00Z");
    private static final Clock CLOCK =
            Clock.fixed(NOW, ZoneOffset.UTC);

    @Test
    void blockingBacklogSampleDoesNotBlockDispatch()
            throws Exception {
        CountDownLatch sampleStarted = new CountDownLatch(1);
        CountDownLatch releaseSample = new CountDownLatch(1);
        ChatMessageOutboxMonitor monitor =
                mock(ChatMessageOutboxMonitor.class);
        when(monitor.sample()).thenAnswer(invocation -> {
            sampleStarted.countDown();
            releaseSample.await();
            return new ChatMessageOutboxBacklogSnapshot(
                    1,
                    NOW,
                    0);
        });
        SimpleMeterRegistry meterRegistry =
                new SimpleMeterRegistry();
        ChatMessageOutboxProperties properties = properties(1_000);
        ChatMessageOutboxMetricsSamplingLifecycle samplingLifecycle =
                samplingLifecycle(
                        monitor,
                        meterRegistry,
                        properties);

        ChatMessageOutboxQueue queue =
                mock(ChatMessageOutboxQueue.class);
        ChatMessagePublisher publisher =
                mock(ChatMessagePublisher.class);
        ClaimedChatMessageOutboxEvent claimed = claimed();
        when(queue.claimNext(any(), any()))
                .thenReturn(Optional.of(claimed), Optional.empty());
        when(queue.deletePublished(
                claimed.eventId(),
                claimed.claimedAttemptCount())).thenReturn(true);
        CountDownLatch published = new CountDownLatch(1);
        doAnswer(invocation -> {
            published.countDown();
            return null;
        }).when(publisher).publish(any());
        ChatMessageOutboxDispatcher dispatcher =
                new ChatMessageOutboxDispatcher(
                        queue,
                        publisher,
                        properties,
                        CLOCK,
                        meterRegistry);

        try {
            samplingLifecycle.start();
            assertThat(sampleStarted.await(1, TimeUnit.SECONDS))
                    .isTrue();

            dispatcher.start();

            assertThat(published.await(1, TimeUnit.SECONDS)).isTrue();
            verify(queue, timeout(1_000)).deletePublished(
                    claimed.eventId(),
                    claimed.claimedAttemptCount());
            assertThat(releaseSample.getCount()).isEqualTo(1);
        } finally {
            releaseSample.countDown();
            dispatcher.stop();
            samplingLifecycle.stop();
        }
    }

    @Test
    void startsImmediatelyRepeatsWithoutOverlapAndStopsSafely()
            throws Exception {
        AtomicInteger calls = new AtomicInteger();
        AtomicInteger active = new AtomicInteger();
        AtomicInteger maxActive = new AtomicInteger();
        CountDownLatch threeSamplesCompleted =
                new CountDownLatch(1);
        Set<String> threadNames = ConcurrentHashMap.newKeySet();
        Set<Long> threadIds = ConcurrentHashMap.newKeySet();
        ChatMessageOutboxMonitor monitor =
                mock(ChatMessageOutboxMonitor.class);
        when(monitor.sample()).thenAnswer(invocation -> {
            int call = calls.incrementAndGet();
            int current = active.incrementAndGet();
            maxActive.accumulateAndGet(current, Math::max);
            threadNames.add(Thread.currentThread().getName());
            threadIds.add(Thread.currentThread().threadId());
            try {
                return new ChatMessageOutboxBacklogSnapshot(
                        0,
                        null,
                        0);
            } finally {
                active.decrementAndGet();
                if (call >= 3) {
                    threeSamplesCompleted.countDown();
                }
            }
        });
        ChatMessageOutboxMetricsSamplingLifecycle lifecycle =
                samplingLifecycle(
                        monitor,
                        new SimpleMeterRegistry(),
                        properties(10));

        lifecycle.start();
        lifecycle.start();

        assertThat(threeSamplesCompleted.await(
                1,
                TimeUnit.SECONDS)).isTrue();
        assertThat(lifecycle.isRunning()).isTrue();
        assertThat(maxActive).hasValue(1);
        assertThat(threadNames)
                .containsExactly("chat-outbox-metrics");
        assertThat(threadIds).hasSize(1);

        lifecycle.stop();
        lifecycle.stop();
        int callsAtStop = calls.get();
        Thread.sleep(50);

        assertThat(lifecycle.isRunning()).isFalse();
        assertThat(calls).hasValue(callsAtStop);
    }

    @Test
    void samplingFailureKeepsMetricsAndDispatcherHealthy()
            throws Exception {
        ChatMessageOutboxBacklogSnapshot first =
                new ChatMessageOutboxBacklogSnapshot(
                        2,
                        NOW.minusSeconds(7),
                        1);
        ChatMessageOutboxBacklogSnapshot recovered =
                new ChatMessageOutboxBacklogSnapshot(
                        4,
                        NOW.minusSeconds(11),
                        0);
        CountDownLatch recoveredSample = new CountDownLatch(1);
        ChatMessageOutboxMonitor monitor =
                mock(ChatMessageOutboxMonitor.class);
        when(monitor.sample())
                .thenReturn(first)
                .thenThrow(new IllegalStateException(
                        "Mongo unavailable"))
                .thenAnswer(invocation -> {
                    recoveredSample.countDown();
                    return recovered;
                });
        SimpleMeterRegistry meterRegistry =
                new SimpleMeterRegistry();
        ChatMessageOutboxProperties properties = properties(5);
        ChatMessageOutboxMetricsSamplingLifecycle lifecycle =
                samplingLifecycle(
                        monitor,
                        meterRegistry,
                        properties);

        ChatMessageOutboxQueue queue =
                mock(ChatMessageOutboxQueue.class);
        when(queue.claimNext(any(), any()))
                .thenReturn(Optional.empty());
        ChatMessageOutboxDispatcher dispatcher =
                new ChatMessageOutboxDispatcher(
                        queue,
                        mock(ChatMessagePublisher.class),
                        properties,
                        CLOCK,
                        meterRegistry);
        ChatMessageOutboxHealthIndicator health =
                new ChatMessageOutboxHealthIndicator(dispatcher);

        try {
            dispatcher.start();
            lifecycle.start();

            assertThat(recoveredSample.await(
                    1,
                    TimeUnit.SECONDS)).isTrue();
            awaitGauge(
                    meterRegistry,
                    "chat.outbox.pending",
                    4);
            assertThat(gauge(
                    meterRegistry,
                    "chat.outbox.pending")).isEqualTo(4);
            assertThat(gauge(
                    meterRegistry,
                    "chat.outbox.oldest.pending.age.seconds"))
                    .isEqualTo(11);
            assertThat(gauge(
                    meterRegistry,
                    "chat.outbox.unsupported")).isZero();
            assertThat(meterRegistry.counter(
                    "chat.outbox.monitor.sample.failures").count())
                    .isEqualTo(1);
            assertThat(dispatcher.state())
                    .isEqualTo(
                            ChatMessageOutboxDispatcher.State.RUNNING);
            assertThat(health.health().getStatus())
                    .isEqualTo(Status.UP);
        } finally {
            lifecycle.stop();
            dispatcher.stop();
        }
    }

    private ChatMessageOutboxMetricsSamplingLifecycle
    samplingLifecycle(
            ChatMessageOutboxMonitor monitor,
            SimpleMeterRegistry meterRegistry,
            ChatMessageOutboxProperties properties
    ) {
        ChatMessageOutboxMetricsSampler sampler =
                new ChatMessageOutboxMetricsSampler(
                        monitor,
                        meterRegistry);
        return new ChatMessageOutboxMetricsSamplingLifecycle(
                sampler,
                properties,
                CLOCK);
    }

    private ChatMessageOutboxProperties properties(
            long metricsIntervalMs
    ) {
        ChatMessageOutboxProperties properties =
                new ChatMessageOutboxProperties();
        properties.setPollIntervalMs(5);
        properties.setClaimTimeoutMs(1_000);
        properties.setBatchSize(10);
        properties.setShutdownDrainTimeoutMs(100);
        properties.setMetricsSampleIntervalMs(metricsIntervalMs);
        properties.getRetry().setInitialBackoffMs(10);
        properties.getRetry().setMaxBackoffMs(100);
        return properties;
    }

    private ClaimedChatMessageOutboxEvent claimed() {
        return new ClaimedChatMessageOutboxEvent(
                ChatMessageOutboxEvent.messageCreatedEventId(
                        "message-1"),
                1L,
                ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION,
                "CHAT_MESSAGE",
                "message-1",
                ChatMessageOutboxEvent.CURRENT_EVENT_VERSION,
                "CHAT_MESSAGE_CREATED",
                "room-1",
                1L,
                new ClaimedChatMessageOutboxEvent.Payload(
                        "message-1",
                        "room-1",
                        1L,
                        "membership-1",
                        "client-1",
                        "hello",
                        com.hamcheeze.chat.message.MessageState.ACTIVE,
                        true,
                        1L,
                        NOW,
                        NOW,
                        null),
                NOW);
    }

    private double gauge(
            SimpleMeterRegistry meterRegistry,
            String name
    ) {
        return meterRegistry.get(name).gauge().value();
    }

    private void awaitGauge(
            SimpleMeterRegistry meterRegistry,
            String name,
            double expected
    ) throws InterruptedException {
        long deadline = System.nanoTime()
                + TimeUnit.SECONDS.toNanos(1);
        while (gauge(meterRegistry, name) != expected
                && System.nanoTime() < deadline) {
            Thread.sleep(5);
        }
        assertThat(gauge(meterRegistry, name))
                .isEqualTo(expected);
    }
}
