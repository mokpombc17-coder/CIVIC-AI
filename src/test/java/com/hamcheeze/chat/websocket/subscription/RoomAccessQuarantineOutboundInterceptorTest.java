package com.hamcheeze.chat.websocket.subscription;

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

class RoomAccessQuarantineOutboundInterceptorTest {

    private final ChatSubscriptionRegistry registry =
            mock(ChatSubscriptionRegistry.class);
    private RoomAccessQuarantineOutboundInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new RoomAccessQuarantineOutboundInterceptor(
                new DestinationPolicy(new ChatContentProperties()),
                registry);
    }

    @Test
    void dropsRevokedRoomTopics() {
        register(messages(true));
        Message<byte[]> message = roomMessage(
                "sub-1", "/topic/rooms/room-1/messages");
        assertThat(interceptor.preSend(message, null)).isNull();

        register(events(true));
        Message<byte[]> event = roomMessage(
                "sub-1", "/topic/rooms/room-1/room-events");
        assertThat(interceptor.preSend(event, null)).isNull();

        register(readReceipts(true));
        Message<byte[]> receipts = roomMessage(
                "sub-1", "/topic/rooms/room-1/read-receipts");
        assertThat(interceptor.preSend(receipts, null)).isNull();
    }

    @Test
    void passesNonRevokedRoomTopics() {
        register(messages(false));
        Message<byte[]> message = roomMessage(
                "sub-1", "/topic/rooms/room-1/messages");
        assertThat(interceptor.preSend(message, null)).isSameAs(message);

        register(events(false));
        registerMessagesCounterpart(false);
        Message<byte[]> event = roomMessage(
                "sub-1", "/topic/rooms/room-1/room-events");
        assertThat(interceptor.preSend(event, null)).isSameAs(event);

        register(readReceipts(false));
        Message<byte[]> receipts = roomMessage(
                "sub-1", "/topic/rooms/room-1/read-receipts");
        assertThat(interceptor.preSend(receipts, null))
                .isSameAs(receipts);
    }

    @Test
    void roomEventsFailClosedUntilNonRevokedMessagesSubscriptionExists() {
        register(events(false));
        Message<byte[]> event = roomMessage(
                "sub-1", "/topic/rooms/room-1/room-events");

        assertThat(interceptor.preSend(event, null)).isNull();

        registerMessagesCounterpart(true);
        assertThat(interceptor.preSend(event, null)).isNull();

        registerMessagesCounterpart(false);
        assertThat(interceptor.preSend(event, null)).isSameAs(event);
    }

    @Test
    void roomScopedMessagesFailClosedForMissingOrMismatchedDescriptor() {
        assertThat(interceptor.preSend(roomMessage(
                "sub-1", "/topic/rooms/room-1/messages"), null))
                .isNull();

        register(events(false));
        assertThat(interceptor.preSend(roomMessage(
                "sub-1", "/topic/rooms/room-1/messages"), null))
                .isNull();

        register(messages(false));
        assertThat(interceptor.preSend(roomMessage(
                "sub-1", "/topic/rooms/room-2/messages"), null))
                .isNull();
        assertThat(interceptor.preSend(roomMessage(
                null, "/topic/rooms/room-1/messages"), null))
                .isNull();
        assertThat(interceptor.preSend(roomMessage(
                "sub-1", "/topic/rooms/room-1/messages", null), null))
                .isNull();
    }

    @Test
    void userQueuesRemainUnaffected() {
        for (String destination : new String[]{
                "/user/queue/command-results",
                "/user/queue/system-events"}) {
            Message<byte[]> message = roomMessage("sub-1", destination);
            assertThat(interceptor.preSend(message, null))
                    .isSameAs(message);
        }
    }

    private void register(SubscriptionDescriptor descriptor) {
        when(registry.find("connection-1", "sub-1"))
                .thenReturn(Optional.of(descriptor));
    }

    private void registerMessagesCounterpart(boolean revoked) {
        when(registry.findRoomSubscription(
                "connection-1",
                "user-1",
                "room-1",
                DestinationKind.TOPIC_ROOM_MESSAGES))
                .thenReturn(Optional.of(messages(revoked)));
    }

    private static SubscriptionDescriptor messages(boolean revoked) {
        return new SubscriptionDescriptor(
                "sub-1",
                "user-1",
                "/topic/rooms/room-1/messages",
                DestinationKind.TOPIC_ROOM_MESSAGES,
                "room-1",
                100L,
                revoked);
    }

    private static SubscriptionDescriptor events(boolean revoked) {
        return new SubscriptionDescriptor(
                "sub-1",
                "user-1",
                "/topic/rooms/room-1/room-events",
                DestinationKind.TOPIC_ROOM_EVENTS,
                "room-1",
                100L,
                revoked);
    }

    private static SubscriptionDescriptor readReceipts(boolean revoked) {
        return new SubscriptionDescriptor(
                "sub-1",
                "user-1",
                "/topic/rooms/room-1/read-receipts",
                DestinationKind.TOPIC_ROOM_READ_RECEIPTS,
                "room-1",
                100L,
                revoked);
    }

    private static Message<byte[]> roomMessage(
            String subscriptionId,
            String destination
    ) {
        return roomMessage(subscriptionId, destination, "connection-1");
    }

    private static Message<byte[]> roomMessage(
            String subscriptionId,
            String destination,
            String connectionId
    ) {
        SimpMessageHeaderAccessor accessor =
                SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        if (connectionId != null) {
            accessor.setSessionId(connectionId);
        }
        if (subscriptionId != null) {
            accessor.setSubscriptionId(subscriptionId);
        }
        accessor.setDestination(destination);
        return MessageBuilder.createMessage(
                new byte[0],
                accessor.getMessageHeaders());
    }
}
