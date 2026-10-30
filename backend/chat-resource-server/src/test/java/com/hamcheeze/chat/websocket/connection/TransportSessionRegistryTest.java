package com.hamcheeze.chat.websocket.connection;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.CloseStatus;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TransportSessionRegistryTest {

    @Test
    void closesReplacedConnectionWithAuthoritativeCodeAndReason()
            throws Exception {
        TransportSessionRegistry registry =
                new TransportSessionRegistry(new SimpleMeterRegistry());
        WebSocketSession oldSession = mock(WebSocketSession.class);
        when(oldSession.getId()).thenReturn("connection-1");
        when(oldSession.isOpen()).thenReturn(true);
        registry.register(oldSession);

        assertThat(registry.closeReplaced("connection-1")).isTrue();
        verify(oldSession).close(
                TransportSessionRegistry.CONNECTION_REPLACED);
        assertThat(TransportSessionRegistry.CONNECTION_REPLACED.getCode())
                .isEqualTo(4001);
        assertThat(TransportSessionRegistry.CONNECTION_REPLACED.getReason())
                .isEqualTo("CONNECTION_REPLACED");
    }

    @Test
    void genericCloseDistinguishesMissingClosedAndFailure()
            throws Exception {
        TransportSessionRegistry registry =
                new TransportSessionRegistry(new SimpleMeterRegistry());
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("connection-1");
        when(session.isOpen()).thenReturn(true);
        registry.register(session);

        assertThat(registry.close(
                "connection-1",
                CloseStatus.POLICY_VIOLATION))
                .isEqualTo(TransportSessionCloseResult.CLOSED);

        WebSocketSession failing = mock(WebSocketSession.class);
        when(failing.getId()).thenReturn("connection-2");
        when(failing.isOpen()).thenReturn(true);
        org.mockito.Mockito.doThrow(new IOException("close failed"))
                .when(failing).close(CloseStatus.POLICY_VIOLATION);
        registry.register(failing);
        assertThat(registry.close(
                "connection-2",
                CloseStatus.POLICY_VIOLATION))
                .isEqualTo(TransportSessionCloseResult.FAILED);

        assertThat(registry.close(
                "missing",
                CloseStatus.POLICY_VIOLATION))
                .isEqualTo(TransportSessionCloseResult
                        .ALREADY_CLOSED_OR_MISSING);
    }
}
