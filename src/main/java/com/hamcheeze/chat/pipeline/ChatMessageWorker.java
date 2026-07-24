package com.hamcheeze.chat.pipeline;

import com.hamcheeze.chat.application.ChatMessageProcessor;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Duration;
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

    private volatile long drainDeadlineNanos = Long.MAX_VALUE;
    private volatile Thread runner;
    private volatile int droppedOnStop;

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
        runner = Thread.currentThread();
        try {
            consumeUntilStop();
            Thread.interrupted();
            drainUntilDeadline();
        } finally {
            int remaining = queue.size();
            if (remaining > 0) {
                queue.clear();
                droppedOnStop = remaining;
            }
            runner = null;
        }
    }

    public void requestStop(Duration drainTimeout) {
        Objects.requireNonNull(drainTimeout, "drainTimeout");
        long timeoutNanos = Math.max(0L, drainTimeout.toNanos());
        long now = System.nanoTime();
        drainDeadlineNanos = now > Long.MAX_VALUE - timeoutNanos
                ? Long.MAX_VALUE
                : now + timeoutNanos;
        stopRequested.set(true);
        Thread activeRunner = runner;
        if (activeRunner != null) {
            activeRunner.interrupt();
        }
    }

    public int droppedOnStop() {
        return droppedOnStop;
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
                if (!stopRequested.get()) {
                    log.debug(
                            "Chat message worker interrupted while running",
                            exception);
                }
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
        }
    }

    private void processSafely(QueuedChatCommand command) {
        Duration queueWait = Duration.between(
                command.acceptedAt(),
                clock.instant());
        queueWaitTimer.record(queueWait.isNegative()
                ? Duration.ZERO
                : queueWait);
        try {
            processor.process(command);
        } catch (RuntimeException exception) {
            commandFailureCounter.increment();
            log.error(
                    "Chat message worker isolated command failure: roomId={}, userId={}, clientMessageId={}",
                    command.command().roomId(),
                    command.command().userId(),
                    command.command().clientMessageId(),
                    exception);
        }
    }
}
