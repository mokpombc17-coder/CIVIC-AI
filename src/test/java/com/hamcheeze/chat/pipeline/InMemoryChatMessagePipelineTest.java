package com.hamcheeze.chat.pipeline;

import com.hamcheeze.chat.application.ChatMessageProcessor;
import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

class InMemoryChatMessagePipelineTest {

    private InMemoryChatMessagePipeline pipeline;

    @AfterEach
    void tearDown() {
        if (pipeline != null && pipeline.isRunning()) {
            pipeline.stop();
        }
    }

    @Test
    void isUnavailableBeforeStartAndAfterStop() throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        pipeline = pipeline(processor, 2, 1_000);

        assertThat(pipeline.availability())
                .isEqualTo(PipelineAvailability.UNAVAILABLE);
        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440010")))
                .isEqualTo(PipelineAcceptance.UNAVAILABLE);

        pipeline.start();
        assertThat(pipeline.availability())
                .isEqualTo(PipelineAvailability.AVAILABLE);
        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440000")))
                .isEqualTo(
                        PipelineAcceptance.ACCEPTED_FOR_PROCESSING);

        ArgumentCaptor<QueuedChatCommand> queued =
                ArgumentCaptor.forClass(QueuedChatCommand.class);
        verify(processor, timeout(1_000))
                .process(queued.capture());
        assertThat(queued.getValue().acceptedAt()).isEqualTo(
                Instant.parse("2026-07-24T00:00:00Z"));

        CountDownLatch stopped = new CountDownLatch(1);
        pipeline.stop(stopped::countDown);
        assertThat(stopped.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(pipeline.state()).isEqualTo(PipelineState.STOPPED);
        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440011")))
                .isEqualTo(PipelineAcceptance.UNAVAILABLE);
    }

    @Test
    void returnsBusyWhenBoundedQueueIsFull() throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        CountDownLatch processingFirst = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        doAnswer(invocation -> {
            processingFirst.countDown();
            releaseFirst.await(2, TimeUnit.SECONDS);
            return null;
        }).when(processor).process(any());
        pipeline = pipeline(processor, 1, 1_000);
        pipeline.start();

        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440000")))
                .isEqualTo(
                        PipelineAcceptance.ACCEPTED_FOR_PROCESSING);
        assertThat(processingFirst.await(1, TimeUnit.SECONDS))
                .isTrue();
        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440001")))
                .isEqualTo(
                        PipelineAcceptance.ACCEPTED_FOR_PROCESSING);
        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440002")))
                .isEqualTo(PipelineAcceptance.BUSY);

        releaseFirst.countDown();
    }

    @Test
    void stopDrainsCommandsAcceptedBeforeStopping()
            throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        CountDownLatch processed = new CountDownLatch(3);
        doAnswer(invocation -> {
            processed.countDown();
            return null;
        }).when(processor).process(any());
        pipeline = pipeline(processor, 10, 1_000);
        pipeline.start();

        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440000")))
                .isEqualTo(
                        PipelineAcceptance.ACCEPTED_FOR_PROCESSING);
        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440001")))
                .isEqualTo(
                        PipelineAcceptance.ACCEPTED_FOR_PROCESSING);
        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440002")))
                .isEqualTo(
                        PipelineAcceptance.ACCEPTED_FOR_PROCESSING);

        CountDownLatch stopped = new CountDownLatch(1);
        pipeline.stop(stopped::countDown);

        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440012")))
                .isEqualTo(PipelineAcceptance.UNAVAILABLE);
        assertThat(processed.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(stopped.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(pipeline.queueSize()).isZero();
    }

    @Test
    void stopDoesNotInterruptInFlightCommandAndCallsBackAfterDrain()
            throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        CountDownLatch processingFirst = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch firstCompleted = new CountDownLatch(1);
        CountDownLatch secondCompleted = new CountDownLatch(1);
        AtomicBoolean interrupted = new AtomicBoolean();
        AtomicInteger attempts = new AtomicInteger();
        doAnswer(invocation -> {
            if (attempts.incrementAndGet() == 1) {
                processingFirst.countDown();
                try {
                    releaseFirst.await();
                } catch (InterruptedException exception) {
                    interrupted.set(true);
                    Thread.currentThread().interrupt();
                }
                interrupted.compareAndSet(
                        false,
                        Thread.currentThread().isInterrupted());
                firstCompleted.countDown();
            } else {
                secondCompleted.countDown();
            }
            return null;
        }).when(processor).process(any());
        pipeline = pipeline(processor, 2, 1_000);
        pipeline.start();

        pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440000"));
        assertThat(processingFirst.await(1, TimeUnit.SECONDS))
                .isTrue();
        pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440001"));

        AtomicInteger callbackCount = new AtomicInteger();
        AtomicBoolean callbackAfterWorkerExit = new AtomicBoolean();
        CountDownLatch stopped = new CountDownLatch(1);
        pipeline.stop(() -> {
            callbackAfterWorkerExit.set(
                    firstCompleted.getCount() == 0
                            && secondCompleted.getCount() == 0
                            && pipeline.state()
                                    == PipelineState.STOPPED);
            callbackCount.incrementAndGet();
            stopped.countDown();
        });

        assertThat(pipeline.state())
                .isEqualTo(PipelineState.STOPPING);
        assertThat(pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440012")))
                .isEqualTo(PipelineAcceptance.UNAVAILABLE);
        assertThat(stopped.await(100, TimeUnit.MILLISECONDS))
                .isFalse();

        releaseFirst.countDown();

        assertThat(stopped.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(interrupted).isFalse();
        assertThat(firstCompleted.getCount()).isZero();
        assertThat(secondCompleted.getCount()).isZero();
        assertThat(callbackAfterWorkerExit).isTrue();
        assertThat(callbackCount).hasValue(1);
        assertThat(pipeline.state()).isEqualTo(PipelineState.STOPPED);
    }

    @Test
    void individualCommandFailureDoesNotTerminateWorker()
            throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        AtomicInteger attempts = new AtomicInteger();
        CountDownLatch secondProcessed = new CountDownLatch(1);
        doAnswer(invocation -> {
            if (attempts.incrementAndGet() == 1) {
                throw new IllegalStateException("first failed");
            }
            secondProcessed.countDown();
            return null;
        }).when(processor).process(any());
        pipeline = pipeline(processor, 10, 1_000);
        pipeline.start();

        pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440000"));
        pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440001"));

        assertThat(secondProcessed.await(2, TimeUnit.SECONDS))
                .isTrue();
        assertThat(pipeline.isRunning()).isTrue();
    }

    @Test
    void unavailableMetricFailureKeepsUnavailableResult() {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        pipeline = pipeline(
                processor,
                1,
                1_000,
                ThrowingMeterRegistry.counter(
                        "chat.pipeline.unavailable"));

        assertThat(pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440029")))
                .isEqualTo(PipelineAcceptance.UNAVAILABLE);
    }

    @Test
    void acceptedMetricFailureKeepsQueuedCommandAndAcceptance()
            throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        CountDownLatch processed = new CountDownLatch(1);
        doAnswer(invocation -> {
            processed.countDown();
            return null;
        }).when(processor).process(any());
        pipeline = pipeline(
                processor,
                2,
                1_000,
                ThrowingMeterRegistry.counter(
                        "chat.pipeline.accepted"));
        pipeline.start();

        assertThat(pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440030")))
                .isEqualTo(
                        PipelineAcceptance.ACCEPTED_FOR_PROCESSING);
        assertThat(processed.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(pipeline.isRunning()).isTrue();
    }

    @Test
    void busyMetricFailureKeepsBusyResult() throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        CountDownLatch processingFirst = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        doAnswer(invocation -> {
            processingFirst.countDown();
            releaseFirst.await();
            return null;
        }).when(processor).process(any());
        pipeline = pipeline(
                processor,
                1,
                1_000,
                ThrowingMeterRegistry.counter(
                        "chat.pipeline.busy"));
        pipeline.start();

        pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440031"));
        assertThat(processingFirst.await(
                1, TimeUnit.SECONDS)).isTrue();
        pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440032"));

        assertThat(pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440033")))
                .isEqualTo(PipelineAcceptance.BUSY);
        releaseFirst.countDown();
    }

    @Test
    void queueWaitAndCommandFailureMetricFailuresKeepWorkerRunning()
            throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        AtomicInteger attempts = new AtomicInteger();
        CountDownLatch secondProcessed = new CountDownLatch(1);
        doAnswer(invocation -> {
            if (attempts.incrementAndGet() == 1) {
                throw new IllegalStateException("command failed");
            }
            secondProcessed.countDown();
            return null;
        }).when(processor).process(any());
        pipeline = pipeline(
                processor,
                2,
                1_000,
                ThrowingMeterRegistry.counterAndTimer(
                        "chat.pipeline.worker.command.failures",
                        "chat.pipeline.queue.wait"));
        pipeline.start();

        pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440034"));
        pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440035"));

        assertThat(secondProcessed.await(
                2, TimeUnit.SECONDS)).isTrue();
        assertThat(pipeline.state())
                .isEqualTo(PipelineState.RUNNING);
    }

    @Test
    void droppedMetricFailureStillStopsAndCallsBackOnce()
            throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        CountDownLatch processingFirst = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        doAnswer(invocation -> {
            processingFirst.countDown();
            releaseFirst.await();
            return null;
        }).when(processor).process(any());
        pipeline = pipeline(
                processor,
                2,
                1,
                ThrowingMeterRegistry.counter(
                        "chat.pipeline.shutdown.dropped"));
        pipeline.start();
        pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440036"));
        assertThat(processingFirst.await(
                1, TimeUnit.SECONDS)).isTrue();
        pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440037"));

        AtomicInteger callbackCount = new AtomicInteger();
        CountDownLatch stopped = new CountDownLatch(1);
        pipeline.stop(() -> {
            callbackCount.incrementAndGet();
            stopped.countDown();
        });
        long releaseAt = System.nanoTime()
                + TimeUnit.MILLISECONDS.toNanos(5);
        while (System.nanoTime() < releaseAt) {
            Thread.onSpinWait();
        }
        releaseFirst.countDown();

        assertThat(stopped.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(pipeline.state())
                .isEqualTo(PipelineState.STOPPED);
        assertThat(pipeline.queueSize()).isZero();
        assertThat(callbackCount).hasValue(1);
    }

    @Test
    void workerFailureMetricFailureStillFinalizesFailedStateAndCallback()
            throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        CountDownLatch processing = new CountDownLatch(1);
        CountDownLatch releaseFailure = new CountDownLatch(1);
        doAnswer(invocation -> {
            processing.countDown();
            releaseFailure.await();
            throw new AssertionError("fatal worker failure");
        }).when(processor).process(any());
        pipeline = pipeline(
                processor,
                1,
                1_000,
                ThrowingMeterRegistry.counter(
                        "chat.pipeline.worker.failures"));
        pipeline.start();
        pipeline.tryAccept(command(
                "550e8400-e29b-41d4-a716-446655440038"));
        assertThat(processing.await(1, TimeUnit.SECONDS)).isTrue();

        AtomicInteger callbackCount = new AtomicInteger();
        CountDownLatch stopped = new CountDownLatch(1);
        pipeline.stop(() -> {
            callbackCount.incrementAndGet();
            stopped.countDown();
        });
        releaseFailure.countDown();

        assertThat(stopped.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(pipeline.state())
                .isEqualTo(PipelineState.FAILED);
        assertThat(callbackCount).hasValue(1);
    }

    @Test
    void drainTimeoutDropsCommandsThatCannotBeProcessedInTime()
            throws Exception {
        ChatMessageProcessor processor =
                mock(ChatMessageProcessor.class);
        CountDownLatch processingFirst = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        AtomicInteger processed = new AtomicInteger();
        doAnswer(invocation -> {
            processed.incrementAndGet();
            processingFirst.countDown();
            while (releaseFirst.getCount() > 0) {
                try {
                    releaseFirst.await(10, TimeUnit.MILLISECONDS);
                } catch (InterruptedException ignored) {
                }
            }
            return null;
        }).when(processor).process(any());

        ChatMessagePipelineProperties properties =
                new ChatMessagePipelineProperties();
        properties.setQueueCapacity(2);
        properties.setShutdownDrainTimeoutMs(20);
        SimpleMeterRegistry meterRegistry =
                new SimpleMeterRegistry();
        pipeline = new InMemoryChatMessagePipeline(
                processor,
                properties,
                Clock.systemUTC(),
                meterRegistry);
        pipeline.start();

        pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440000"));
        assertThat(processingFirst.await(1, TimeUnit.SECONDS))
                .isTrue();
        pipeline.tryAccept(command("550e8400-e29b-41d4-a716-446655440001"));

        CountDownLatch stopped = new CountDownLatch(1);
        pipeline.stop(stopped::countDown);
        Thread.sleep(50);
        releaseFirst.countDown();

        assertThat(stopped.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(processed.get()).isEqualTo(1);
        assertThat(pipeline.queueSize()).isZero();
        assertThat(meterRegistry.counter(
                "chat.pipeline.shutdown.dropped").count())
                .isEqualTo(1);
    }

    private InMemoryChatMessagePipeline pipeline(
            ChatMessageProcessor processor,
            int queueCapacity,
            long drainTimeoutMs
    ) {
        return pipeline(
                processor,
                queueCapacity,
                drainTimeoutMs,
                new SimpleMeterRegistry());
    }

    private InMemoryChatMessagePipeline pipeline(
            ChatMessageProcessor processor,
            int queueCapacity,
            long drainTimeoutMs,
            MeterRegistry meterRegistry
    ) {
        ChatMessagePipelineProperties properties =
                new ChatMessagePipelineProperties();
        properties.setQueueCapacity(queueCapacity);
        properties.setShutdownDrainTimeoutMs(drainTimeoutMs);
        return new InMemoryChatMessagePipeline(
                processor,
                properties,
                Clock.fixed(
                        Instant.parse("2026-07-24T00:00:00Z"),
                        ZoneOffset.UTC),
                meterRegistry);
    }

    private AdmittedChatCommand command(String clientMessageId) {
        return new AdmittedChatCommand(
                "user-1",
                "connection-1",
                "room-1",
                clientMessageId,
                "hello");
    }
}
