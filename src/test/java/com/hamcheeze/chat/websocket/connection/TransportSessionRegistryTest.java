package com.hamcheeze.chat.websocket.connection;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

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
}
