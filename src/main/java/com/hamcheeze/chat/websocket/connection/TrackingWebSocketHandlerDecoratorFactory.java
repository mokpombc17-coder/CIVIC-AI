package com.hamcheeze.chat.websocket.connection;

import com.hamcheeze.chat.websocket.config.WebSocketTransportProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

import java.io.IOException;
import java.time.Instant;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public final class TrackingWebSocketHandlerDecoratorFactory
        implements WebSocketHandlerDecoratorFactory {

    private final TransportSessionRegistry registry;
    private final Counter abnormalCloseCounter;
    private final TaskScheduler taskScheduler;
    private final int timeToFirstMessageMs;

    public TrackingWebSocketHandlerDecoratorFactory(
            TransportSessionRegistry registry,
            MeterRegistry meterRegistry,
            @Qualifier("chatWebSocketTaskScheduler")
            TaskScheduler taskScheduler,
            WebSocketTransportProperties transportProperties
    ) {
        this.registry = registry;
        this.abnormalCloseCounter =
                meterRegistry.counter("websocket.connections.abnormally_closed");
        this.taskScheduler = taskScheduler;
        this.timeToFirstMessageMs =
                transportProperties.getTimeToFirstMessageMs();
    }

    @Override
    public WebSocketHandler decorate(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {

            private final ConcurrentMap<String, FirstMessageGuard>
                    firstMessageTimeouts = new ConcurrentHashMap<>();

            @Override
            public void afterConnectionEstablished(WebSocketSession session)
                    throws Exception {
                registry.register(session);
                FirstMessageGuard guard = new FirstMessageGuard();
                firstMessageTimeouts.put(session.getId(), guard);
                guard.setFuture(taskScheduler.schedule(
                        () -> closeIfFirstMessageMissing(session, guard),
                        Instant.now().plusMillis(timeToFirstMessageMs)));
                super.afterConnectionEstablished(session);
            }

            @Override
            public void handleMessage(
                    WebSocketSession session,
                    WebSocketMessage<?> message
            ) throws Exception {
                cancelFirstMessageTimeout(session.getId());
                super.handleMessage(session, message);
            }

            @Override
            public void handleTransportError(
                    WebSocketSession session,
                    Throwable exception
            ) throws Exception {
                super.handleTransportError(session, exception);
            }

            @Override
            public void afterConnectionClosed(
                    WebSocketSession session,
                    CloseStatus closeStatus
            ) throws Exception {
                cancelFirstMessageTimeout(session.getId());
                registry.remove(session.getId());
                if (!CloseStatus.NORMAL.equals(closeStatus)
                        && closeStatus.getCode() != 4001) {
                    abnormalCloseCounter.increment();
                }
                super.afterConnectionClosed(session, closeStatus);
            }

            private void closeIfFirstMessageMissing(
                    WebSocketSession session,
                    FirstMessageGuard guard
            ) {
                if (!firstMessageTimeouts.remove(session.getId(), guard)
                        || !guard.complete()
                        || !session.isOpen()) {
                    return;
                }
                try {
                    session.close(CloseStatus.SESSION_NOT_RELIABLE);
                } catch (IOException ignored) {
                    // The normal transport error/close path performs cleanup.
                }
            }

            private void cancelFirstMessageTimeout(String connectionId) {
                FirstMessageGuard timeout =
                        firstMessageTimeouts.remove(connectionId);
                if (timeout != null) {
                    timeout.cancel();
                }
            }
        };
    }

    private static final class FirstMessageGuard {
        private final AtomicBoolean completed = new AtomicBoolean();
        private volatile ScheduledFuture<?> future;

        private void setFuture(ScheduledFuture<?> future) {
            this.future = future;
            if (completed.get()) {
                future.cancel(false);
            }
        }

        private boolean complete() {
            return completed.compareAndSet(false, true);
        }

        private void cancel() {
            completed.set(true);
            ScheduledFuture<?> current = future;
            if (current != null) {
                current.cancel(false);
            }
        }
    }
}
