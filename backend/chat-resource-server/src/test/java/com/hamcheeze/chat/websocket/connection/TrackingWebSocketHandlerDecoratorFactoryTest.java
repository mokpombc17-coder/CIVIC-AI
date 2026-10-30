package com.hamcheeze.chat.websocket.connection;

import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import com.hamcheeze.chat.websocket.config.WebSocketTransportProperties;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TrackingWebSocketHandlerDecoratorFactoryTest {

    @Test
    void abnormalCloseMetricFailureDoesNotBlockTransportCleanup()
            throws Exception {
        TransportSessionRegistry registry =
                mock(TransportSessionRegistry.class);
        TaskScheduler scheduler = mock(TaskScheduler.class);
        WebSocketTransportProperties properties =
                new WebSocketTransportProperties();
        WebSocketHandler delegate = mock(WebSocketHandler.class);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("connection-1");
        TrackingWebSocketHandlerDecoratorFactory factory =
                new TrackingWebSocketHandlerDecoratorFactory(
                        registry,
                        ThrowingMeterRegistry.counter(
                                "websocket.connections.abnormally_closed"),
                        scheduler,
                        properties);

        factory.decorate(delegate).afterConnectionClosed(
                session,
                CloseStatus.SERVER_ERROR);

        verify(registry).remove("connection-1");
        verify(delegate).afterConnectionClosed(
                session,
                CloseStatus.SERVER_ERROR);
    }
}
