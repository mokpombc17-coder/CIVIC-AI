package com.hamcheeze.chat.pipeline;

import com.hamcheeze.chat.application.ChatMessageProcessor;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

public final class InMemoryChatMessagePipeline
        implements ChatMessagePipeline, SmartLifecycle {

    private static final Logger log =
            LoggerFactory.getLogger(InMemoryChatMessagePipeline.class);
    // Spring stops higher phases first. The context shutdown integration
    // test keeps this phase above every messaging lifecycle used by drain.
    public static final int LIFECYCLE_PHASE =
            SmartLifecycle.DEFAULT_PHASE - 1_000;

    private final ReentrantLock lifecycleLock = new ReentrantLock();
    private final ArrayBlockingQueue<QueuedChatCommand> queue;
    private final ChatMessageProcessor processor;
    private final ChatMessagePipelineProperties properties;
    private final Clock clock;
    private final MeterRegistry meterRegistry;
    private final AtomicInteger workerRunning = new AtomicInteger();
    private final Counter acceptedCounter;
    private final Counter busyCounter;
    private final Counter unavailableCounter;
    private final Counter droppedCounter;
    private final Counter workerFailureCounter;
    private final List<Runnable> stopCallbacks =
            new ArrayList<>();

    private volatile PipelineState state = PipelineState.NEW;
    private volatile ChatMessageWorker worker;

    public InMemoryChatMessagePipeline(
            ChatMessageProcessor processor,
            ChatMessagePipelineProperties properties,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this.processor = Objects.requireNonNull(
                processor, "processor");
        this.properties = Objects.requireNonNull(
                properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.meterRegistry = Objects.requireNonNull(
                meterRegistry, "meterRegistry");
        this.queue = new ArrayBlockingQueue<>(
                properties.getQueueCapacity());
        this.acceptedCounter =
                meterRegistry.counter("chat.pipeline.accepted");
        this.busyCounter =
                meterRegistry.counter("chat.pipeline.busy");
        this.unavailableCounter =
                meterRegistry.counter("chat.pipeline.unavailable");
        this.droppedCounter =
                meterRegistry.counter("chat.pipeline.shutdown.dropped");
        this.workerFailureCounter =
                meterRegistry.counter("chat.pipeline.worker.failures");
        Gauge.builder(
                        "chat.pipeline.queue.size",
                        queue,
                        ArrayBlockingQueue::size)
                .register(meterRegistry);
        Gauge.builder(
                        "chat.pipeline.queue.capacity",
                        properties,
                        ChatMessagePipelineProperties::getQueueCapacity)
                .register(meterRegistry);
        Gauge.builder(
                        "chat.pipeline.queue.remaining_capacity",
                        queue,
                        ArrayBlockingQueue::remainingCapacity)
                .register(meterRegistry);
        Gauge.builder(
                        "chat.pipeline.worker.running",
                        workerRunning,
                        AtomicInteger::get)
                .register(meterRegistry);
    }

    @Override
    public PipelineAvailability availability() {
        return state == PipelineState.RUNNING
                ? PipelineAvailability.AVAILABLE
                : PipelineAvailability.UNAVAILABLE;
    }

    @Override
    public PipelineAcceptance tryAccept(
            AdmittedChatCommand command
    ) {
        Objects.requireNonNull(command, "command");
        lifecycleLock.lock();
        try {
            if (state != PipelineState.RUNNING) {
                BestEffortMetricRecorder.increment(
                        "chat.pipeline.unavailable",
                        unavailableCounter);
                return PipelineAcceptance.UNAVAILABLE;
            }
            boolean accepted = queue.offer(
                    new QueuedChatCommand(command, clock.instant()));
            if (accepted) {
                BestEffortMetricRecorder.increment(
                        "chat.pipeline.accepted",
                        acceptedCounter);
                return PipelineAcceptance.ACCEPTED_FOR_PROCESSING;
            }
            BestEffortMetricRecorder.increment(
                    "chat.pipeline.busy",
                    busyCounter);
            log.warn(
                    "Chat pipeline queue full: connectionId={}, roomId={}, clientMessageId={}, queueSize={}, queueCapacity={}",
                    command.connectionId(),
                    command.roomId(),
                    command.clientMessageId(),
                    queue.size(),
                    properties.getQueueCapacity());
            return PipelineAcceptance.BUSY;
        } finally {
            lifecycleLock.unlock();
        }
    }

    @Override
    public void start() {
        lifecycleLock.lock();
        try {
            if (state == PipelineState.RUNNING
                    || state == PipelineState.STARTING) {
                return;
            }
            if (state == PipelineState.STOPPING) {
                throw new IllegalStateException(
                        "Cannot start pipeline while it is stopping");
            }

            state = PipelineState.STARTING;
            ChatMessageWorker nextWorker = new ChatMessageWorker(
                    queue,
                    processor,
                    clock,
                    meterRegistry);
            Thread nextThread = Thread.ofPlatform()
                    .name("chat-message-worker")
                    .unstarted(() -> runWorker(nextWorker));
            worker = nextWorker;
            try {
                nextThread.start();
                workerRunning.set(1);
                state = PipelineState.RUNNING;
            } catch (RuntimeException exception) {
                worker = null;
                state = PipelineState.FAILED;
                throw exception;
            }
        } finally {
            lifecycleLock.unlock();
        }
    }

    @Override
    public void stop(Runnable callback) {
        Objects.requireNonNull(callback, "callback");
        ChatMessageWorker activeWorker = null;
        Instant drainStartedAt = null;
        long drainStartedNanos = 0L;
        boolean completeImmediately = false;

        lifecycleLock.lock();
        try {
            if (state == PipelineState.STOPPING) {
                stopCallbacks.add(callback);
                return;
            }
            if (state == PipelineState.NEW
                    || state == PipelineState.STOPPED
                    || state == PipelineState.FAILED) {
                state = PipelineState.STOPPED;
                completeImmediately = true;
            } else {
                state = PipelineState.STOPPING;
                drainStartedAt = clock.instant();
                drainStartedNanos = System.nanoTime();
                stopCallbacks.add(callback);
                activeWorker = worker;
            }
        } finally {
            lifecycleLock.unlock();
        }

        if (completeImmediately) {
            callback.run();
            return;
        }
        if (activeWorker == null) {
            finishStop(null, null);
            return;
        }
        activeWorker.requestStop(
                Duration.ofMillis(
                        properties.getShutdownDrainTimeoutMs()),
                drainStartedAt,
                drainStartedNanos);
    }

    @Override
    public void stop() {
        CountDownLatch stopped = new CountDownLatch(1);
        stop(stopped::countDown);
        try {
            stopped.await();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public boolean isRunning() {
        return state == PipelineState.RUNNING;
    }

    @Override
    public boolean isAutoStartup() {
        return true;
    }

    @Override
    public int getPhase() {
        return LIFECYCLE_PHASE;
    }

    public PipelineState state() {
        return state;
    }

    public int queueSize() {
        return queue.size();
    }

    private void runWorker(ChatMessageWorker activeWorker) {
        Throwable failure = null;
        try {
            activeWorker.run();
        } catch (Throwable throwable) {
            failure = throwable;
        } finally {
            finishStop(activeWorker, failure);
        }
    }

    private void finishStop(
            ChatMessageWorker terminatedWorker,
            Throwable failure
    ) {
        List<Runnable> callbacks;
        ChatMessageWorker.ShutdownReport shutdownReport =
                terminatedWorker == null
                        ? null
                        : terminatedWorker.shutdownReport();
        PipelineState finalState;
        lifecycleLock.lock();
        try {
            if (terminatedWorker != null
                    && terminatedWorker != worker) {
                return;
            }
            workerRunning.set(0);
            if (shutdownReport != null
                    && shutdownReport.droppedCount() > 0) {
                BestEffortMetricRecorder.increment(
                        "chat.pipeline.shutdown.dropped",
                        droppedCounter,
                        shutdownReport.droppedCount());
                log.warn(
                        "Dropped queued chat commands on shutdown: count={}",
                        shutdownReport.droppedCount());
            }
            if (failure != null) {
                BestEffortMetricRecorder.increment(
                        "chat.pipeline.worker.failures",
                        workerFailureCounter);
                log.error(
                        "Chat message worker terminated unexpectedly: pipelineState={}, queueSize={}",
                        state,
                        queue.size(),
                        failure);
                state = PipelineState.FAILED;
            } else {
                state = PipelineState.STOPPED;
            }
            finalState = state;
            worker = null;
            callbacks = List.copyOf(stopCallbacks);
            stopCallbacks.clear();
        } finally {
            lifecycleLock.unlock();
        }
        if (shutdownReport != null
                && shutdownReport.drainStartedAt() != null) {
            log.info(
                    "Chat pipeline shutdown completed: drainTimeoutMs={}, drainStartedAt={}, drainElapsedMs={}, processedDuringDrain={}, droppedCount={}, inFlightAtStop={}, finalPipelineState={}",
                    properties.getShutdownDrainTimeoutMs(),
                    shutdownReport.drainStartedAt(),
                    shutdownReport.drainElapsedMs(),
                    shutdownReport.processedDuringDrain(),
                    shutdownReport.droppedCount(),
                    shutdownReport.inFlightAtStop(),
                    finalState);
        }
        callbacks.forEach(this::runStopCallback);
    }

    private void runStopCallback(Runnable callback) {
        try {
            callback.run();
        } catch (RuntimeException exception) {
            log.error(
                    "Chat pipeline shutdown callback failed",
                    exception);
        }
    }
}
