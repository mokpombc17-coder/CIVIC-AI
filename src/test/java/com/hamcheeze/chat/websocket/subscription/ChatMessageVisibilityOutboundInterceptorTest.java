package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.delivery.ChatMessageBrokerHeaders;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import com.hamcheeze.chat.websocket.protocol.DestinationPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.MessageBuilder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatMessageVisibilityOutboundInterceptorTest {

    private final ChatSubscriptionRegistry registry =
            mock(ChatSubscriptionRegistry.class);
    private ChatMessageVisibilityOutboundInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new ChatMessageVisibilityOutboundInterceptor(
                new DestinationPolicy(new ChatContentProperties()),
                registry);
    }

    @Test
    void dropsDelayedMessageAtOrBelowSubscriberBoundary() {
        registerMessagesBoundary(100);

        assertThat(interceptor.preSend(message(
                "/topic/rooms/room-1/messages", 100L), null))
                .isNull();
        assertThat(interceptor.preSend(message(
                "/topic/rooms/room-1/messages", 99L), null))
                .isNull();
    }

    @Test
    void passesMessageAboveSubscriberBoundary() {
        registerMessagesBoundary(100);
        Message<byte[]> message = message(
                "/topic/rooms/room-1/messages", 101L);

        assertThat(interceptor.preSend(message, null)).isSameAs(message);
    }

    @Test
    void appliesEachSubscribersOwnBoundary() {
        when(registry.find("connection-1", "sub-1"))
                .thenReturn(Optional.of(descriptor(100)));
        when(registry.find("connection-2", "sub-2"))
                .thenReturn(Optional.of(new SubscriptionDescriptor(
                        "sub-2",
                        "user-2",
                        "/topic/rooms/room-1/messages",
                        DestinationKind.TOPIC_ROOM_MESSAGES,
                        "room-1",
                        120L)));

        Message<byte[]> first = message(
                "connection-1", "sub-1",
                "/topic/rooms/room-1/messages", 110L);
        Message<byte[]> second = message(
                "connection-2", "sub-2",
                "/topic/rooms/room-1/messages", 110L);

        assertThat(interceptor.preSend(first, null)).isSameAs(first);
        assertThat(interceptor.preSend(second, null)).isNull();
    }

    @Test
    void messagesFailClosedWithoutDescriptorOrValidSequenceHeader() {
        Message<byte[]> valid = message(
                "/topic/rooms/room-1/messages", 101L);
        assertThat(interceptor.preSend(valid, null)).isNull();

        registerMessagesBoundary(100);
        assertThat(interceptor.preSend(message(
                "/topic/rooms/room-1/messages", null), null))
                .isNull();
        assertThat(interceptor.preSend(message(
                "/topic/rooms/room-1/messages", "101"), null))
                .isNull();
    }

    @Test
    void otherDestinationsRemainUnaffected() {
        for (String destination : new String[]{
                "/topic/rooms/room-1/room-events",
                "/user/queue/command-results",
                "/user/queue/system-events"}) {
            Message<byte[]> message = message(destination, null);
            assertThat(interceptor.preSend(message, null))
                    .isSameAs(message);
        }
    }

    private void registerMessagesBoundary(long boundary) {
        when(registry.find("connection-1", "sub-1"))
                .thenReturn(Optional.of(descriptor(boundary)));
    }

    private static SubscriptionDescriptor descriptor(long boundary) {
        return new SubscriptionDescriptor(
                "sub-1",
                "user-1",
                "/topic/rooms/room-1/messages",
                DestinationKind.TOPIC_ROOM_MESSAGES,
                "room-1",
                boundary);
    }

    private static Message<byte[]> message(
            String destination,
            Object sequence
    ) {
        return message(
                "connection-1",
                "sub-1",
                destination,
                sequence);
    }

    private static Message<byte[]> message(
            String connectionId,
            String subscriptionId,
            String destination,
            Object sequence
    ) {
        SimpMessageHeaderAccessor accessor =
                SimpMessageHeaderAccessor.create(
                        SimpMessageType.MESSAGE);
        accessor.setSessionId(connectionId);
        accessor.setSubscriptionId(subscriptionId);
        accessor.setDestination(destination);
        if (sequence != null) {
            accessor.setHeader(
                    ChatMessageBrokerHeaders.ROOM_SEQUENCE,
                    sequence);
        }
        return MessageBuilder.createMessage(
                new byte[0],
                accessor.getMessageHeaders());
    }
}
