package com.hamcheeze.chat.message.outbox;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

import java.time.Clock;
import java.util.Objects;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

public final class ChatMessageOutboxMetricsSamplingLifecycle
        implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(
            ChatMessageOutboxMetricsSamplingLifecycle.class);

    public static final int LIFECYCLE_PHASE =
            ChatMessageOutboxDispatcher.LIFECYCLE_PHASE - 1_000;

    private final ReentrantLock lifecycleLock = new ReentrantLock();
    private final ChatMessageOutboxMetricsSampler sampler;
    private final ChatMessageOutboxProperties properties;
    private final Clock clock;

    private volatile boolean running;
    private ScheduledExecutorService executor;
    private ScheduledFuture<?> samplingTask;

    public ChatMessageOutboxMetricsSamplingLifecycle(
            ChatMessageOutboxMetricsSampler sampler,
            ChatMessageOutboxProperties properties,
            Clock clock
    ) {
        this.sampler = Objects.requireNonNull(sampler, "sampler");
        this.properties = Objects.requireNonNull(
                properties,
                "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Override
    public void start() {
        lifecycleLock.lock();
        try {
            if (running) {
                return;
            }
            ScheduledExecutorService nextExecutor =
                    Executors.newSingleThreadScheduledExecutor(
                            Thread.ofPlatform()
                                    .name("chat-outbox-metrics")
                                    .daemon(true)
                                    .factory());
            try {
                ScheduledFuture<?> nextTask =
                        nextExecutor.scheduleWithFixedDelay(
                                this::sample,
                                0,
                                properties
                                        .getMetricsSampleIntervalMs(),
                                TimeUnit.MILLISECONDS);
                executor = nextExecutor;
                samplingTask = nextTask;
                running = true;
            } catch (RuntimeException exception) {
                nextExecutor.shutdownNow();
                throw exception;
            }
        } finally {
            lifecycleLock.unlock();
        }
    }

    @Override
    public void stop(Runnable callback) {
        Objects.requireNonNull(callback, "callback");
        ScheduledFuture<?> task = null;
        ScheduledExecutorService activeExecutor = null;
        boolean completeImmediately = false;
        lifecycleLock.lock();
        try {
            if (!running) {
                completeImmediately = true;
            } else {
                running = false;
                task = samplingTask;
                activeExecutor = executor;
                samplingTask = null;
                executor = null;
            }
        } finally {
            lifecycleLock.unlock();
        }

        if (completeImmediately) {
            callback.run();
            return;
        }
        if (task != null) {
            task.cancel(true);
        }
        if (activeExecutor != null) {
            activeExecutor.shutdownNow();
        }
        callback.run();
    }

    @Override
    public void stop() {
        stop(() -> {
        });
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public boolean isAutoStartup() {
        return true;
    }

    @Override
    public int getPhase() {
        return LIFECYCLE_PHASE;
    }

    private void sample() {
        try {
            sampler.sample(clock.instant());
        } catch (RuntimeException exception) {
            log.warn(
                    "Unexpected chat outbox metrics sampling failure",
                    exception);
        }
    }
}
