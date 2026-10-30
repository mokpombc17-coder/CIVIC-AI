package com.hamcheeze.chat.message.outbox;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.pipeline.InMemoryChatMessagePipeline;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

public final class ChatMessageOutboxDispatcher
        implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(
            ChatMessageOutboxDispatcher.class);

    public static final int LIFECYCLE_PHASE =
            InMemoryChatMessagePipeline.LIFECYCLE_PHASE - 1_000;
    static final String PAYLOAD_DECODE_ERROR =
            "PAYLOAD_DECODE_ERROR";
    static final String PUBLISH_FAILED = "PUBLISH_FAILED";

    public enum State {
        NEW,
        STARTING,
        RUNNING,
        STOPPING,
        STOPPED,
        FAILED
    }

    private final ReentrantLock lifecycleLock = new ReentrantLock();
    private final Object wakeupMonitor = new Object();
    private final List<Runnable> stopCallbacks = new ArrayList<>();
    private final ChatMessageOutboxQueue queue;
    private final ChatMessagePublisher publisher;
    private final ChatMessageOutboxProperties properties;
    private final PublishedChatMessageObserver publishedObserver;
    private final Clock clock;
    private final AtomicInteger workerRunning = new AtomicInteger();
    private final AtomicInteger inFlight = new AtomicInteger();
    private final Counter claimedCounter;
    private final Counter publishedCounter;
    private final Counter publishFailureCounter;
    private final Counter claimFailureCounter;
    private final Counter deleteFailureCounter;
    private final Counter deleteFencedCounter;
    private final Counter rescheduleFailureCounter;
    private final Counter rescheduleFencedCounter;
    private final Counter workerFailureCounter;
    private final Counter observerFailureCounter;
    private final Timer dispatchTimer;

    private volatile State state = State.NEW;
    private volatile long shutdownDeadlineNanos;

    public ChatMessageOutboxDispatcher(
            ChatMessageOutboxQueue queue,
            ChatMessagePublisher publisher,
            ChatMessageOutboxProperties properties,
            Clock clock,
            MeterRegistry meterRegistry
    ) {
        this(
                queue,
                publisher,
                properties,
                clock,
                meterRegistry,
                PublishedChatMessageObserver.NOOP);
    }

    public ChatMessageOutboxDispatcher(
            ChatMessageOutboxQueue queue,
            ChatMessagePublisher publisher,
            ChatMessageOutboxProperties properties,
            Clock clock,
            MeterRegistry meterRegistry,
            PublishedChatMessageObserver publishedObserver
    ) {
        this.queue = Objects.requireNonNull(queue, "queue");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
        this.properties = Objects.requireNonNull(
                properties,
                "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.publishedObserver = Objects.requireNonNull(
                publishedObserver, "publishedObserver");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.claimedCounter = meterRegistry.counter(
                "chat.outbox.claimed");
        this.publishedCounter = meterRegistry.counter(
                "chat.outbox.published");
        this.publishFailureCounter = meterRegistry.counter(
                "chat.outbox.publish.failures");
        this.claimFailureCounter = meterRegistry.counter(
                "chat.outbox.claim.failures");
        this.deleteFailureCounter = meterRegistry.counter(
                "chat.outbox.delete.failures");
        this.deleteFencedCounter = meterRegistry.counter(
                "chat.outbox.delete.fenced");
        this.rescheduleFailureCounter = meterRegistry.counter(
                "chat.outbox.reschedule.failures");
        this.rescheduleFencedCounter = meterRegistry.counter(
                "chat.outbox.reschedule.fenced");
        this.workerFailureCounter = meterRegistry.counter(
                "chat.outbox.worker.failures");
        this.observerFailureCounter = meterRegistry.counter(
                "room.inbox.notification.observer.failures");
        this.dispatchTimer = meterRegistry.timer(
                "chat.outbox.dispatch.duration");
        Gauge.builder(
                        "chat.outbox.worker.running",
                        workerRunning,
                        AtomicInteger::get)
                .register(meterRegistry);
        Gauge.builder(
                        "chat.outbox.in_flight",
                        inFlight,
                        AtomicInteger::get)
                .register(meterRegistry);
    }

    @Override
    public void start() {
        lifecycleLock.lock();
        try {
            if (state == State.RUNNING || state == State.STARTING) {
                return;
            }
            if (state == State.STOPPING) {
                throw new IllegalStateException(
                        "Cannot start outbox dispatcher while stopping");
            }
            state = State.STARTING;
            Thread nextThread = Thread.ofPlatform()
                    .name("chat-outbox-dispatcher")
                    .unstarted(this::runWorker);
            try {
                workerRunning.set(1);
                state = State.RUNNING;
                nextThread.start();
            } catch (RuntimeException exception) {
                workerRunning.set(0);
                state = State.FAILED;
                throw exception;
            }
        } finally {
            lifecycleLock.unlock();
        }
    }

    @Override
    public void stop(Runnable callback) {
        Objects.requireNonNull(callback, "callback");
        boolean completeImmediately = false;
        lifecycleLock.lock();
        try {
            if (state == State.STOPPING) {
                stopCallbacks.add(callback);
                return;
            }
            if (state == State.FAILED) {
                completeImmediately = true;
            } else if (state == State.NEW
                    || state == State.STOPPED) {
                state = State.STOPPED;
                completeImmediately = true;
            } else {
                state = State.STOPPING;
                shutdownDeadlineNanos = saturatingAdd(
                        System.nanoTime(),
                        Duration.ofMillis(
                                        properties
                                                .getShutdownDrainTimeoutMs())
                                .toNanos());
                stopCallbacks.add(callback);
            }
        } finally {
            lifecycleLock.unlock();
        }
        if (completeImmediately) {
            callback.run();
            return;
        }
        synchronized (wakeupMonitor) {
            wakeupMonitor.notifyAll();
        }
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
        return state == State.RUNNING;
    }

    @Override
    public boolean isAutoStartup() {
        return true;
    }

    @Override
    public int getPhase() {
        return LIFECYCLE_PHASE;
    }

    public State state() {
        return state;
    }

    public int inFlight() {
        return inFlight.get();
    }

    public boolean workerRunning() {
        return workerRunning.get() == 1;
    }

    private void runWorker() {
        Throwable failure = null;
        try {
            while (true) {
                State currentState = state;
                if (currentState != State.RUNNING
                        && currentState != State.STOPPING) {
                    break;
                }
                if (currentState == State.STOPPING
                        && System.nanoTime()
                        >= shutdownDeadlineNanos) {
                    break;
                }
                boolean processed = dispatchBatch();
                if (currentState == State.STOPPING && !processed) {
                    break;
                }
                if (!processed) {
                    waitForWork();
                }
            }
        } catch (Throwable throwable) {
            failure = throwable;
        } finally {
            finishWorker(failure);
        }
    }

    private boolean dispatchBatch() {
        int processed = 0;
        for (int index = 0;
             index < properties.getBatchSize();
             index++) {
            if (state == State.STOPPING
                    && System.nanoTime()
                    >= shutdownDeadlineNanos) {
                break;
            }
            Optional<ClaimedChatMessageOutboxEvent> claimed;
            try {
                Instant now = clock.instant();
                claimed = queue.claimNext(
                        now,
                        Duration.ofMillis(
                                properties.getClaimTimeoutMs()));
            } catch (RuntimeException exception) {
                BestEffortMetricRecorder.increment(
                        "chat.outbox.claim.failures",
                        claimFailureCounter);
                log.warn(
                        "Chat outbox claim failed; polling will retry",
                        exception);
                return processed > 0;
            }
            if (claimed.isEmpty()) {
                break;
            }
            processed++;
            BestEffortMetricRecorder.increment(
                    "chat.outbox.claimed",
                    claimedCounter);
            dispatch(claimed.orElseThrow());
        }
        return processed > 0;
    }

    private void dispatch(ClaimedChatMessageOutboxEvent claimed) {
        long startedNanos = System.nanoTime();
        inFlight.incrementAndGet();
        try {
            ChatMessageEventEnvelope envelope;
            try {
                envelope = claimed.decodeEnvelope();
            } catch (RuntimeException exception) {
                reschedule(
                        claimed,
                        Duration.ofMillis(
                                properties.getRetry().getMaxBackoffMs()),
                        PAYLOAD_DECODE_ERROR);
                log.warn(
                        "Malformed supported chat outbox event was rescheduled: "
                                + "eventId={}, attemptCount={}",
                        claimed.eventId(),
                        claimed.claimedAttemptCount());
                return;
            }

            try {
                publisher.publish(envelope);
            } catch (RuntimeException exception) {
                BestEffortMetricRecorder.increment(
                        "chat.outbox.publish.failures",
                        publishFailureCounter);
                reschedule(
                        claimed,
                        retryBackoff(claimed.claimedAttemptCount()),
                        PUBLISH_FAILED);
                log.warn(
                        "Chat outbox publish failed and was rescheduled: "
                                + "eventId={}, attemptCount={}, failureType={}",
                        claimed.eventId(),
                        claimed.claimedAttemptCount(),
                        exception.getClass().getSimpleName());
                return;
            }

            BestEffortMetricRecorder.increment(
                    "chat.outbox.published",
                    publishedCounter);
            try {
                publishedObserver.onPublished(claimed, envelope);
            } catch (RuntimeException exception) {
                BestEffortMetricRecorder.increment(
                        "room.inbox.notification.observer.failures",
                        observerFailureCounter);
                log.warn(
                        "Room inbox notification observer failed; "
                                + "message outbox completion continues: "
                                + "eventId={}, attemptCount={}",
                        claimed.eventId(),
                        claimed.claimedAttemptCount(),
                        exception);
            }
            try {
                boolean deleted = queue.deletePublished(
                        claimed.eventId(),
                        claimed.claimedAttemptCount());
                if (!deleted) {
                    BestEffortMetricRecorder.increment(
                            "chat.outbox.delete.fenced",
                            deleteFencedCounter);
                    log.warn(
                            "Published chat outbox event was not deleted "
                                    + "because its claim was superseded: "
                                    + "eventId={}, attemptCount={}",
                            claimed.eventId(),
                            claimed.claimedAttemptCount());
                }
            } catch (RuntimeException exception) {
                BestEffortMetricRecorder.increment(
                        "chat.outbox.delete.failures",
                        deleteFailureCounter);
                log.warn(
                        "Published chat outbox event delete failed; "
                                + "claim timeout will make it retryable: "
                                + "eventId={}, attemptCount={}",
                        claimed.eventId(),
                        claimed.claimedAttemptCount(),
                        exception);
            }
        } finally {
            inFlight.decrementAndGet();
            long elapsed = Math.max(
                    0,
                    System.nanoTime() - startedNanos);
            BestEffortMetricRecorder.record(
                    "chat.outbox.dispatch.duration",
                    dispatchTimer,
                    Duration.ofNanos(elapsed));
        }
    }

    private void reschedule(
            ClaimedChatMessageOutboxEvent claimed,
            Duration backoff,
            String failureType
    ) {
        try {
            boolean updated = queue.reschedule(
                    claimed.eventId(),
                    claimed.claimedAttemptCount(),
                    clock.instant().plus(backoff),
                    failureType);
            if (!updated) {
                BestEffortMetricRecorder.increment(
                        "chat.outbox.reschedule.fenced",
                        rescheduleFencedCounter);
                log.warn(
                        "Chat outbox reschedule was fenced: "
                                + "eventId={}, attemptCount={}",
                        claimed.eventId(),
                        claimed.claimedAttemptCount());
            }
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.outbox.reschedule.failures",
                    rescheduleFailureCounter);
            log.warn(
                    "Chat outbox reschedule failed; claim timeout will "
                            + "make it retryable: eventId={}, attemptCount={}",
                    claimed.eventId(),
                    claimed.claimedAttemptCount(),
                    exception);
        }
    }

    Duration retryBackoff(long attemptCount) {
        long value = properties.getRetry().getInitialBackoffMs();
        long maximum = properties.getRetry().getMaxBackoffMs();
        for (long attempt = 1;
             attempt < attemptCount && value < maximum;
             attempt++) {
            value = value > maximum / 2
                    ? maximum
                    : value * 2;
        }
        return Duration.ofMillis(Math.min(value, maximum));
    }

    private void waitForWork() {
        synchronized (wakeupMonitor) {
            if (state != State.RUNNING) {
                return;
            }
            try {
                wakeupMonitor.wait(properties.getPollIntervalMs());
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(
                        "Chat outbox dispatcher worker was interrupted",
                        exception);
            }
        }
    }

    private void finishWorker(Throwable failure) {
        List<Runnable> callbacks;
        lifecycleLock.lock();
        try {
            workerRunning.set(0);
            if (failure != null) {
                BestEffortMetricRecorder.increment(
                        "chat.outbox.worker.failures",
                        workerFailureCounter);
                state = State.FAILED;
                log.error(
                        "Chat outbox dispatcher terminated unexpectedly",
                        failure);
            } else {
                state = State.STOPPED;
            }
            callbacks = List.copyOf(stopCallbacks);
            stopCallbacks.clear();
        } finally {
            lifecycleLock.unlock();
        }
        for (Runnable callback : callbacks) {
            try {
                callback.run();
            } catch (RuntimeException exception) {
                log.warn(
                        "Chat outbox dispatcher stop callback failed",
                        exception);
            }
        }
    }

    private static long saturatingAdd(long left, long right) {
        if (right > 0 && left > Long.MAX_VALUE - right) {
            return Long.MAX_VALUE;
        }
        return left + right;
    }
}
