package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.health.contributor.Status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

class ChatMessageOutboxDispatcherTest {

    private static final Instant NOW =
            Instant.parse("2026-07-30T05:00:00Z");

    @Test
    void publishesAndDeletesClaimedEvent() throws Exception {
        Fixture fixture = fixture();
        ClaimedChatMessageOutboxEvent claimed = claimed(1L);
        when(fixture.queue.claimNext(any(), any()))
                .thenReturn(Optional.of(claimed), Optional.empty());
        when(fixture.queue.deletePublished(
                claimed.eventId(),
                1L)).thenReturn(true);

        fixture.dispatcher.start();
        await(() -> fixture.meterRegistry.counter(
                "chat.outbox.published").count() == 1);
        fixture.dispatcher.stop();

        verify(fixture.publisher).publish(any());
        verify(fixture.queue).deletePublished(
                claimed.eventId(),
                1L);
        verify(fixture.queue, never()).reschedule(
                any(), any(Long.class), any(), any());
        assertThat(fixture.dispatcher.state())
                .isEqualTo(
                        ChatMessageOutboxDispatcher.State.STOPPED);
    }

    @Test
    void publishFailureReschedulesWithExponentialBackoff()
            throws Exception {
        Fixture fixture = fixture();
        ClaimedChatMessageOutboxEvent claimed = claimed(3L);
        when(fixture.queue.claimNext(any(), any()))
                .thenReturn(Optional.of(claimed), Optional.empty());
        when(fixture.queue.reschedule(
                any(), any(Long.class), any(), any()))
                .thenReturn(true);
        doThrow(new IllegalStateException("broker unavailable"))
                .when(fixture.publisher)
                .publish(any());

        fixture.dispatcher.start();
        await(() -> fixture.meterRegistry.counter(
                "chat.outbox.publish.failures").count() == 1);
        fixture.dispatcher.stop();

        verify(fixture.queue).reschedule(
                claimed.eventId(),
                3L,
                NOW.plusMillis(40),
                ChatMessageOutboxDispatcher.PUBLISH_FAILED);
        verify(fixture.queue, never()).deletePublished(any(), any(Long.class));
    }

    @Test
    void malformedPayloadUsesMaximumBackoff() throws Exception {
        Fixture fixture = fixture();
        ClaimedChatMessageOutboxEvent malformed =
                new ClaimedChatMessageOutboxEvent(
                        "event-1",
                        1L,
                        ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION,
                        "CHAT_MESSAGE",
                        "message-1",
                        1,
                        "CHAT_MESSAGE_CREATED",
                        "room-1",
                        1L,
                        new ClaimedChatMessageOutboxEvent.Payload(
                                "message-1",
                                "room-1",
                                1L,
                                "user-1",
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
        when(fixture.queue.claimNext(any(), any()))
                .thenReturn(Optional.of(malformed), Optional.empty());
        when(fixture.queue.reschedule(
                any(), any(Long.class), any(), any()))
                .thenReturn(true);

        fixture.dispatcher.start();
        await(() -> {
            try {
                verify(fixture.queue).reschedule(
                        malformed.eventId(),
                        1L,
                        NOW.plusMillis(100),
                        ChatMessageOutboxDispatcher
                                .PAYLOAD_DECODE_ERROR);
                return true;
            } catch (AssertionError ignored) {
                return false;
            }
        });
        assertThat(fixture.dispatcher.state())
                .isEqualTo(
                        ChatMessageOutboxDispatcher.State.RUNNING);
        fixture.dispatcher.stop();

        verify(fixture.publisher, never()).publish(any());
    }

    @Test
    void deleteFailureLeavesLeaseWithoutReschedule()
            throws Exception {
        Fixture fixture = fixture();
        ClaimedChatMessageOutboxEvent claimed = claimed(1L);
        when(fixture.queue.claimNext(any(), any()))
                .thenReturn(Optional.of(claimed), Optional.empty());
        doThrow(new IllegalStateException("Mongo unavailable"))
                .when(fixture.queue)
                .deletePublished(claimed.eventId(), 1L);

        fixture.dispatcher.start();
        await(() -> fixture.meterRegistry.counter(
                "chat.outbox.delete.failures").count() == 1);
        fixture.dispatcher.stop();

        verify(fixture.queue, never()).reschedule(
                any(), any(Long.class), any(), any());
        assertThat(fixture.meterRegistry.counter(
                "chat.outbox.published").count()).isEqualTo(1);
    }

    @Test
    void individualClaimFailureKeepsWorkerRunning()
            throws Exception {
        Fixture fixture = fixture();
        when(fixture.queue.claimNext(any(), any()))
                .thenThrow(new IllegalStateException("Mongo unavailable"))
                .thenReturn(Optional.empty());

        fixture.dispatcher.start();
        await(() -> fixture.meterRegistry.counter(
                "chat.outbox.claim.failures").count() == 1);

        assertThat(fixture.dispatcher.state())
                .isEqualTo(
                        ChatMessageOutboxDispatcher.State.RUNNING);
        fixture.dispatcher.stop();
    }

    @Test
    void fatalWorkerFailureChangesHealthToDown()
            throws Exception {
        Fixture fixture = fixture();
        when(fixture.queue.claimNext(any(), any()))
                .thenThrow(new AssertionError("fatal"));
        ChatMessageOutboxHealthIndicator healthIndicator =
                new ChatMessageOutboxHealthIndicator(
                        fixture.dispatcher);

        assertThat(healthIndicator.health().getStatus())
                .isEqualTo(Status.OUT_OF_SERVICE);
        fixture.dispatcher.start();
        await(() -> fixture.dispatcher.state()
                == ChatMessageOutboxDispatcher.State.FAILED);

        assertThat(healthIndicator.health().getStatus())
                .isEqualTo(Status.DOWN);
        assertThat(fixture.meterRegistry.counter(
                "chat.outbox.worker.failures").count())
                .isEqualTo(1);

        fixture.dispatcher.stop();
        assertThat(fixture.dispatcher.state())
                .isEqualTo(
                        ChatMessageOutboxDispatcher.State.FAILED);
    }

    @Test
    void shutdownDeadlineStopsClaimingAfterCurrentPublish()
            throws Exception {
        Fixture fixture = fixture();
        fixture.properties.setShutdownDrainTimeoutMs(5);
        ClaimedChatMessageOutboxEvent first = claimed(1L);
        ClaimedChatMessageOutboxEvent second =
                new ClaimedChatMessageOutboxEvent(
                        "chat-message-created:message-2",
                        1L,
                        first.schemaVersion(),
                        first.aggregateType(),
                        "message-2",
                        first.eventVersion(),
                        first.eventType(),
                        first.roomId(),
                        2L,
                        new ClaimedChatMessageOutboxEvent.Payload(
                                "message-2",
                                "room-1",
                                2L,
                                "user-1",
                                "membership-1",
                                "client-2",
                                "hello",
                                com.hamcheeze.chat.message.MessageState.ACTIVE,
                                true,
                                1L,
                                NOW,
                                NOW,
                                null),
                        NOW);
        when(fixture.queue.claimNext(any(), any()))
                .thenReturn(
                        Optional.of(first),
                        Optional.of(second),
                        Optional.empty());
        when(fixture.queue.deletePublished(any(), any(Long.class)))
                .thenReturn(true);
        CountDownLatch publishStarted = new CountDownLatch(1);
        CountDownLatch releasePublish = new CountDownLatch(1);
        doAnswer(invocation -> {
            publishStarted.countDown();
            releasePublish.await();
            return null;
        }).when(fixture.publisher).publish(any());
        CountDownLatch stopped = new CountDownLatch(1);

        fixture.dispatcher.start();
        assertThat(publishStarted.await(1, TimeUnit.SECONDS))
                .isTrue();
        fixture.dispatcher.stop(stopped::countDown);
        Thread.sleep(20);
        releasePublish.countDown();

        assertThat(stopped.await(1, TimeUnit.SECONDS)).isTrue();
        verify(fixture.publisher, times(1)).publish(any());
        assertThat(fixture.dispatcher.state())
                .isEqualTo(
                        ChatMessageOutboxDispatcher.State.STOPPED);
    }

    @Test
    void retryBackoffSaturatesAtMaximum() {
        Fixture fixture = fixture();

        assertThat(fixture.dispatcher.retryBackoff(1))
                .isEqualTo(Duration.ofMillis(10));
        assertThat(fixture.dispatcher.retryBackoff(2))
                .isEqualTo(Duration.ofMillis(20));
        assertThat(fixture.dispatcher.retryBackoff(4))
                .isEqualTo(Duration.ofMillis(80));
        assertThat(fixture.dispatcher.retryBackoff(5))
                .isEqualTo(Duration.ofMillis(100));
        assertThat(fixture.dispatcher.retryBackoff(Long.MAX_VALUE))
                .isEqualTo(Duration.ofMillis(100));
    }

    @Test
    void observerFailureDoesNotPreventPublishedDelete()
            throws Exception {
        ChatMessageOutboxQueue queue =
                mock(ChatMessageOutboxQueue.class);
        ChatMessagePublisher publisher =
                mock(ChatMessagePublisher.class);
        PublishedChatMessageObserver observer =
                mock(PublishedChatMessageObserver.class);
        ClaimedChatMessageOutboxEvent claimed = claimed(1L);
        when(queue.claimNext(any(), any()))
                .thenReturn(Optional.of(claimed), Optional.empty());
        when(queue.deletePublished(claimed.eventId(), 1L))
                .thenReturn(true);
        doThrow(new IllegalStateException("queue full"))
                .when(observer).onPublished(any(), any());
        ChatMessageOutboxProperties properties =
                new ChatMessageOutboxProperties();
        properties.setPollIntervalMs(5);
        SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        ChatMessageOutboxDispatcher dispatcher =
                new ChatMessageOutboxDispatcher(
                        queue,
                        publisher,
                        properties,
                        Clock.fixed(NOW, ZoneOffset.UTC),
                        metrics,
                        observer);

        dispatcher.start();
        await(() -> metrics.counter(
                "room.inbox.notification.observer.failures")
                .count() == 1);
        dispatcher.stop();

        verify(publisher).publish(any());
        verify(queue).deletePublished(claimed.eventId(), 1L);
    }

    private Fixture fixture() {
        ChatMessageOutboxQueue queue =
                mock(ChatMessageOutboxQueue.class);
        ChatMessagePublisher publisher =
                mock(ChatMessagePublisher.class);
        SimpleMeterRegistry meterRegistry =
                new SimpleMeterRegistry();
        ChatMessageOutboxProperties properties =
                new ChatMessageOutboxProperties();
        properties.setPollIntervalMs(5);
        properties.setClaimTimeoutMs(1_000);
        properties.setBatchSize(10);
        properties.setShutdownDrainTimeoutMs(100);
        properties.setMetricsSampleIntervalMs(1_000);
        properties.getRetry().setInitialBackoffMs(10);
        properties.getRetry().setMaxBackoffMs(100);
        ChatMessageOutboxDispatcher dispatcher =
                new ChatMessageOutboxDispatcher(
                        queue,
                        publisher,
                        properties,
                        Clock.fixed(NOW, ZoneOffset.UTC),
                        meterRegistry);
        return new Fixture(
                queue,
                publisher,
                meterRegistry,
                properties,
                dispatcher);
    }

    private ClaimedChatMessageOutboxEvent claimed(long attempt) {
        return new ClaimedChatMessageOutboxEvent(
                "chat-message-created:message-1",
                attempt,
                ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION,
                "CHAT_MESSAGE",
                "message-1",
                1,
                "CHAT_MESSAGE_CREATED",
                "room-1",
                1L,
                new ClaimedChatMessageOutboxEvent.Payload(
                        "message-1",
                        "room-1",
                        1L,
                        "user-1",
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

    private void await(Condition condition) throws Exception {
        long deadline = System.nanoTime()
                + TimeUnit.SECONDS.toNanos(2);
        while (!condition.matches()
                && System.nanoTime() < deadline) {
            Thread.sleep(5);
        }
        assertThat(condition.matches()).isTrue();
    }

    @FunctionalInterface
    private interface Condition {
        boolean matches();
    }

    private record Fixture(
            ChatMessageOutboxQueue queue,
            ChatMessagePublisher publisher,
            SimpleMeterRegistry meterRegistry,
            ChatMessageOutboxProperties properties,
            ChatMessageOutboxDispatcher dispatcher
    ) {
    }
}
