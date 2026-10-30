package com.hamcheeze.chat.websocket.connection;

import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import com.hamcheeze.chat.websocket.protocol.StompPolicyException;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(OutputCaptureExtension.class)
class ActiveConnectionLifecycleInterceptorTest {

    private final ActiveConnectionRegistry registry =
            mock(ActiveConnectionRegistry.class);
    private final TransportSessionRegistry transport =
            mock(TransportSessionRegistry.class);
    private final ChatSubscriptionRegistry subscriptions =
            mock(ChatSubscriptionRegistry.class);
    private final ActiveConnectionLifecycleInterceptor interceptor =
            new ActiveConnectionLifecycleInterceptor(
                    registry,
                    transport,
                    subscriptions,
                    new SimpleMeterRegistry());

    @Test
    void closedReplacementIsHandledWithoutEagerCleanup(
            CapturedOutput output
    ) {
        when(registry.activate("user-1", "connection-2"))
                .thenReturn(
                        ConnectionActivation.activated("connection-1"));
        when(transport.close(
                "connection-1",
                TransportSessionRegistry.CONNECTION_REPLACED))
                .thenReturn(TransportSessionCloseResult.CLOSED);

        interceptor.preSend(connect("connection-2"), null);

        verify(transport).close(
                "connection-1",
                TransportSessionRegistry.CONNECTION_REPLACED);
        verify(subscriptions, never()).removeAll("connection-1");
        verify(transport, never()).remove("connection-1");
        assertReplacementLog(
                output,
                TransportSessionCloseResult.CLOSED);
    }

    @Test
    void alreadyClosedReplacementCleansStaleTracking(
            CapturedOutput output
    ) {
        when(registry.activate("user-1", "connection-2"))
                .thenReturn(
                        ConnectionActivation.activated("connection-1"));
        when(transport.close(
                "connection-1",
                TransportSessionRegistry.CONNECTION_REPLACED))
                .thenReturn(TransportSessionCloseResult
                        .ALREADY_CLOSED_OR_MISSING);

        interceptor.preSend(connect("connection-2"), null);

        verify(subscriptions).removeAll("connection-1");
        verify(transport).remove("connection-1");
        verify(registry, never()).deactivate(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString());
        assertReplacementLog(
                output,
                TransportSessionCloseResult.ALREADY_CLOSED_OR_MISSING);
    }

    @Test
    void failedReplacementCloseRetainsTrackingForLaterRevocation(
            CapturedOutput output
    ) {
        when(registry.activate("user-1", "connection-2"))
                .thenReturn(
                        ConnectionActivation.activated("connection-1"));
        when(transport.close(
                "connection-1",
                TransportSessionRegistry.CONNECTION_REPLACED))
                .thenReturn(TransportSessionCloseResult.FAILED);

        interceptor.preSend(connect("connection-2"), null);

        verify(subscriptions, never()).removeAll("connection-1");
        verify(transport, never()).remove("connection-1");
        assertReplacementLog(
                output,
                TransportSessionCloseResult.FAILED);
    }

    @Test
    void replacementMetricFailureStillClosesReplacedConnection() {
        when(registry.activate("user-1", "connection-2"))
                .thenReturn(
                        ConnectionActivation.activated("connection-1"));
        ActiveConnectionLifecycleInterceptor metricFailingInterceptor =
                new ActiveConnectionLifecycleInterceptor(
                        registry,
                        transport,
                        subscriptions,
                        ThrowingMeterRegistry.counter(
                                "websocket.connections.replaced"));
        when(transport.close(
                "connection-1",
                TransportSessionRegistry.CONNECTION_REPLACED))
                .thenReturn(TransportSessionCloseResult.CLOSED);

        metricFailingInterceptor.preSend(
                connect("connection-2"), null);

        verify(transport).close(
                "connection-1",
                TransportSessionRegistry.CONNECTION_REPLACED);
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

    private static void assertReplacementLog(
            CapturedOutput output,
            TransportSessionCloseResult closeResult
    ) {
        String expectedLevel = closeResult
                == TransportSessionCloseResult.FAILED
                ? " WARN "
                : " INFO ";
        assertThat(output.getOut())
                .contains(expectedLevel)
                .contains("WebSocket connection replacement: ")
                .contains("userId=user-1")
                .contains("oldConnectionId=connection-1")
                .contains("newConnectionId=connection-2")
                .contains("replacementReason=CONNECTION_REPLACED")
                .contains("closeResult=" + closeResult)
                .doesNotContain("civic_ai_access_token")
                .doesNotContain("Bearer ");
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
