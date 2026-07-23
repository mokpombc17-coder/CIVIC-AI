package com.hamcheeze.chat.websocket.connection;

import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ActiveConnectionLifecycleInterceptorTest {

    private final ActiveConnectionRegistry registry =
            mock(ActiveConnectionRegistry.class);
    private final TransportSessionRegistry transport =
            mock(TransportSessionRegistry.class);
    private final ActiveConnectionLifecycleInterceptor interceptor =
            new ActiveConnectionLifecycleInterceptor(
                    registry, transport, new SimpleMeterRegistry());

    @Test
    void closesOnlyTheReplacedConnectionAfterRegistrySwap() {
        when(registry.activate("user-1", "connection-2"))
                .thenReturn(
                        ConnectionActivation.activated("connection-1"));

        interceptor.preSend(connect("connection-2"), null);

        verify(transport).closeReplaced("connection-1");
    }

    @Test
    void blocksLateSendFromInactiveConnection() {
        when(registry.isActive("user-1", "connection-1"))
                .thenReturn(false);

        assertThatThrownBy(() ->
                interceptor.preSend(send("connection-1"), null))
                .isInstanceOf(StompPolicyException.class)
                .hasMessage("INACTIVE_CONNECTION");
    }

    private static Message<byte[]> connect(String connectionId) {
        return message(StompCommand.CONNECT, connectionId);
    }

    private static Message<byte[]> send(String connectionId) {
        return message(StompCommand.SEND, connectionId);
    }

    private static Message<byte[]> message(
            StompCommand command,
            String connectionId
    ) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        accessor.setSessionId(connectionId);
        accessor.setUser(
                UsernamePasswordAuthenticationToken.authenticated(
                        "user-1", "n/a", java.util.List.of()));
        return MessageBuilder.createMessage(
                new byte[0], accessor.getMessageHeaders());
    }
}
