package com.hamcheeze.chat.pipeline;

import com.hamcheeze.chat.application.ChatMessageProcessor;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ChatMessageWorker implements Runnable {

    private static final Logger log =
            LoggerFactory.getLogger(ChatMessageWorker.class);
    private static final long IDLE_POLL_MS = 250;

    private final BlockingQueue<QueuedChatCommand> queue;
    private final ChatMessageProcessor processor;
    private final Clock clock;
    private final Counter commandFailureCounter;
    private final Timer queueWaitTimer;
    private final AtomicBoolean stopRequested =
            new AtomicBoolean();
    private final AtomicBoolean processing =
            new AtomicBoolean();

    private volatile long drainDeadlineNanos = Long.MAX_VALUE;
    private volatile long drainStartedNanos;
    private volatile Instant drainStartedAt;
    private volatile long drainElapsedMs;
    private volatile int processedDuringDrain;
    private volatile int droppedOnStop;
    private volatile int inFlightAtStop;

    public ChatMessageWorker(
            BlockingQueue<QueuedChatCommand> queue,
            ChatMessageProcessor processor,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this.queue = Objects.requireNonNull(queue, "queue");
        this.processor = Objects.requireNonNull(
                processor, "processor");
        this.clock = Objects.requireNonNull(clock, "clock");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.commandFailureCounter = meterRegistry.counter(
                "chat.pipeline.worker.command.failures");
        this.queueWaitTimer = meterRegistry.timer(
                "chat.pipeline.queue.wait");
    }

    @Override
    public void run() {
        try {
            consumeUntilStop();
            drainUntilDeadline();
        } finally {
            int remaining = queue.size();
            if (remaining > 0) {
                queue.clear();
                droppedOnStop = remaining;
            }
            if (drainStartedNanos > 0L) {
                drainElapsedMs = TimeUnit.NANOSECONDS.toMillis(
                        Math.max(
                                0L,
                                System.nanoTime() - drainStartedNanos));
            }
        }
    }

    public void requestStop(
            Duration drainTimeout,
            Instant startedAt,
            long startedNanos
    ) {
        Objects.requireNonNull(drainTimeout, "drainTimeout");
        this.drainStartedAt = Objects.requireNonNull(
                startedAt, "startedAt");
        long timeoutNanos = Math.max(0L, drainTimeout.toNanos());
        drainStartedNanos = startedNanos;
        drainDeadlineNanos =
                startedNanos > Long.MAX_VALUE - timeoutNanos
                ? Long.MAX_VALUE
                : startedNanos + timeoutNanos;
        inFlightAtStop = processing.get() ? 1 : 0;
        stopRequested.set(true);
    }

    public ShutdownReport shutdownReport() {
        return new ShutdownReport(
                drainStartedAt,
                drainElapsedMs,
                processedDuringDrain,
                droppedOnStop,
                inFlightAtStop);
    }

    private void consumeUntilStop() {
        while (!stopRequested.get()) {
            try {
                QueuedChatCommand command =
                        queue.poll(IDLE_POLL_MS, TimeUnit.MILLISECONDS);
                if (command != null) {
                    processSafely(command);
                }
            } catch (InterruptedException exception) {
                if (stopRequested.get()) {
                    log.info(
                            "Chat message worker interrupted while stopping; continuing with drain policy");
                    return;
                }
                log.warn(
                        "Chat message worker interrupted unexpectedly while running; continuing",
                        exception);
            }
        }
    }

    private void drainUntilDeadline() {
        while (System.nanoTime() < drainDeadlineNanos) {
            QueuedChatCommand command = queue.poll();
            if (command == null) {
                return;
            }
            processSafely(command);
            processedDuringDrain++;
        }
    }

    private void processSafely(QueuedChatCommand command) {
        processing.set(true);
        try {
            Duration queueWait = Duration.between(
                    command.acceptedAt(),
                    clock.instant());
            BestEffortMetricRecorder.record(
                    "chat.pipeline.queue.wait",
                    queueWaitTimer,
                    queueWait.isNegative()
                            ? Duration.ZERO
                            : queueWait);
            try {
                processor.process(command);
            } catch (RuntimeException exception) {
                BestEffortMetricRecorder.increment(
                        "chat.pipeline.worker.command.failures",
                        commandFailureCounter);
                log.error(
                        "Chat message worker isolated command failure: roomId={}, userId={}, clientMessageId={}",
                        command.command().roomId(),
                        command.command().userId(),
                        command.command().clientMessageId(),
                        exception);
            }
        } finally {
            processing.set(false);
        }
    }

    public record ShutdownReport(
            Instant drainStartedAt,
            long drainElapsedMs,
            int processedDuringDrain,
            int droppedCount,
            int inFlightAtStop
    ) {
    }
}
