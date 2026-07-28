package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.protocol.DestinationPolicy;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SubscriptionPolicyInterceptorTest {

    private final RoomAuthorizationService authorization =
            mock(RoomAuthorizationService.class);
    private final ChatSubscriptionRegistry registry =
            mock(ChatSubscriptionRegistry.class);
    private final SubscriptionResultSender sender =
            mock(SubscriptionResultSender.class);
    private SubscriptionPolicyInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new SubscriptionPolicyInterceptor(
                new DestinationPolicy(new ChatContentProperties()),
                authorization,
                registry,
                sender,
                new SimpleMeterRegistry());
    }

    @Test
    void disabledReadReceiptSkipsAuthorizationAndRegistry() {
        Message<byte[]> message = subscribe(
                "/topic/rooms/room-1/read-receipts");

        assertThat(interceptor.preSend(message, null)).isNull();
        verifyNoInteractions(authorization, registry);
        ArgumentCaptor<SubscriptionRejected> result =
                ArgumentCaptor.forClass(SubscriptionRejected.class);
        verify(sender).send(
                eq("user-1"), eq("connection-1"), result.capture());
        assertThat(result.getValue().code())
                .isEqualTo(SubscriptionRejectedCode.DESTINATION_DISABLED);
    }

    @Test
    void rejectionMetricFailureStillSendsRejectionResult() {
        interceptor = new SubscriptionPolicyInterceptor(
                new DestinationPolicy(new ChatContentProperties()),
                authorization,
                registry,
                sender,
                ThrowingMeterRegistry.counter(
                        "stomp.subscriptions.rejected"));
        Message<byte[]> message = subscribe(
                "/topic/rooms/room-1/read-receipts");

        assertThat(interceptor.preSend(message, null)).isNull();

        verify(sender).send(
                eq("user-1"),
                eq("connection-1"),
                any(SubscriptionRejected.class));
    }

    @Test
    void userDestinationSkipsRoomAuthorization() {
        when(registry.register(eq("connection-1"), any()))
                .thenReturn(SubscriptionRegistrationResult.accepted());
        Message<byte[]> message =
                subscribe("/user/queue/command-results");

        assertThat(interceptor.preSend(message, null)).isSameAs(message);
        verifyNoInteractions(authorization, sender);
        verify(registry).register(eq("connection-1"), any());
    }

    @Test
    void roomDestinationChecksAuthorizationBeforeAndAfterRegistration() {
        when(authorization.authorizeSubscription("user-1", "room-1"))
                .thenReturn(RoomAuthorizationDecision.ALLOWED);
        when(registry.register(eq("connection-1"), any()))
                .thenReturn(SubscriptionRegistrationResult.accepted());
        Message<byte[]> message =
                subscribe("/topic/rooms/room-1/messages");

        assertThat(interceptor.preSend(message, null)).isSameAs(message);
        verify(authorization, org.mockito.Mockito.times(2))
                .authorizeSubscription("user-1", "room-1");
        ArgumentCaptor<SubscriptionDescriptor> descriptor =
                ArgumentCaptor.forClass(SubscriptionDescriptor.class);
        verify(registry).register(
                eq("connection-1"),
                descriptor.capture());
        assertThat(descriptor.getValue().userId()).isEqualTo("user-1");
    }

    @Test
    void authorizationLostAfterRegistrationRemovesSubscription() {
        when(authorization.authorizeSubscription("user-1", "room-1"))
                .thenReturn(
                        RoomAuthorizationDecision.ALLOWED,
                        RoomAuthorizationDecision.FORBIDDEN);
        when(registry.register(eq("connection-1"), any()))
                .thenReturn(SubscriptionRegistrationResult.accepted());
        Message<byte[]> message =
                subscribe("/topic/rooms/room-1/messages");

        assertThat(interceptor.preSend(message, null)).isNull();

        verify(registry).remove("connection-1", "sub-1");
        ArgumentCaptor<SubscriptionRejected> result =
                ArgumentCaptor.forClass(SubscriptionRejected.class);
        verify(sender).send(
                eq("user-1"), eq("connection-1"), result.capture());
        assertThat(result.getValue().code()).isEqualTo(
                SubscriptionRejectedCode.ROOM_SUBSCRIPTION_FORBIDDEN);
    }

    private static Message<byte[]> subscribe(String destination) {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(destination);
        accessor.setSubscriptionId("sub-1");
        accessor.setSessionId("connection-1");
        accessor.setUser(
                UsernamePasswordAuthenticationToken.authenticated(
                        "user-1", "n/a", java.util.List.of()));
        return MessageBuilder.createMessage(
                new byte[0], accessor.getMessageHeaders());
    }
}
