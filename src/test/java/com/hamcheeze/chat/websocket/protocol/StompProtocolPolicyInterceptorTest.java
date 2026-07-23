package com.hamcheeze.chat.websocket.protocol;

import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.config.HeartbeatProperties;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StompProtocolPolicyInterceptorTest {

    private final StompProtocolPolicyInterceptor interceptor =
            new StompProtocolPolicyInterceptor(
                    new DestinationPolicy(new ChatContentProperties()),
                    new HeartbeatProperties());

    @Test
    void acceptsContractHeartbeat() {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setUser(
                UsernamePasswordAuthenticationToken.authenticated(
                        "user-1", "n/a", java.util.List.of()));
        accessor.setHeartbeat(10_000, 10_000);

        Message<byte[]> message = message(accessor);

        assertThat(interceptor.preSend(message, null))
                .isSameAs(message);
    }

    @Test
    void rejectsMissingOrDisabledHeartbeat() {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setUser(
                UsernamePasswordAuthenticationToken.authenticated(
                        "user-1", "n/a", java.util.List.of()));
        accessor.setHeartbeat(0, 0);

        assertThatThrownBy(() ->
                interceptor.preSend(message(accessor), null))
                .isInstanceOf(StompPolicyException.class)
                .hasMessage("INVALID_HEARTBEAT_POLICY");
    }

    @Test
    void leavesDisabledDestinationForSubscriptionPolicy() {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(
                "/topic/rooms/room-1/read-receipts");
        accessor.setSubscriptionId("sub-1");

        Message<byte[]> message = message(accessor);

        assertThat(interceptor.preSend(message, null))
                .isSameAs(message);
    }

    @Test
    void rejectsDirectTopicSend() {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setDestination("/topic/rooms/room-1/messages");

        assertThatThrownBy(() ->
                interceptor.preSend(message(accessor), null))
                .isInstanceOf(StompPolicyException.class)
                .hasMessage("INVALID_SEND_DESTINATION");
    }

    private static Message<byte[]> message(
            StompHeaderAccessor accessor
    ) {
        return MessageBuilder.createMessage(
                new byte[0], accessor.getMessageHeaders());
    }
}
