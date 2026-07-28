package com.hamcheeze.chat.websocket.access;

import com.hamcheeze.chat.room.application.access.RoomAccessRevocationReason;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationSummary;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.connection.InMemoryActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.connection.TransportSessionCloseResult;
import com.hamcheeze.chat.websocket.connection.TransportSessionRegistry;
import com.hamcheeze.chat.websocket.config.ConnectionLimitProperties;
import com.hamcheeze.chat.websocket.config.SubscriptionLimitProperties;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import com.hamcheeze.chat.websocket.subscription.InMemoryChatSubscriptionRegistry;
import com.hamcheeze.chat.websocket.subscription.SubscriptionDescriptor;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketRoomAccessRevokerTest {

    private final ActiveConnectionRegistry active =
            mock(ActiveConnectionRegistry.class);
    private final ChatSubscriptionRegistry subscriptions =
            mock(ChatSubscriptionRegistry.class);
    private final TransportSessionRegistry transport =
            mock(TransportSessionRegistry.class);
    private final WebSocketRoomAccessRevoker revoker =
            new WebSocketRoomAccessRevoker(
                    active,
                    subscriptions,
                    transport,
                    new SimpleMeterRegistry());

    @Test
    void userWithoutConnectionOrRoomSubscriptionIsNoOp() {
        when(active.findConnectionIdByUser("user-1"))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of("connection-1"));
        when(subscriptions.hasRoomSubscription(
                "connection-1",
                "room-1")).thenReturn(false);

        assertThat(revoker.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .isEqualTo(RoomAccessRevocationSummary.noOp());
        assertThat(revoker.revokeUserRoomAccess(
                "user-1",
                "room-1",
                RoomAccessRevocationReason.MEMBERSHIP_LEFT))
                .isEqualTo(RoomAccessRevocationSummary.noOp());
        verify(transport, never()).close(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void successfulUserCloseCleansRegistries() {
        when(active.findConnectionIdByUser("user-1"))
                .thenReturn(Optional.of("connection-1"));
        when(active.findUserIdByConnection("connection-1"))
                .thenReturn(Optional.of("user-1"));
        when(subscriptions.hasRoomSubscription(
                "connection-1",
                "room-1")).thenReturn(true);
        when(transport.close(
                "connection-1",
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED))
                .thenReturn(TransportSessionCloseResult.CLOSED);

        RoomAccessRevocationSummary summary =
                revoker.revokeUserRoomAccess(
                        "user-1",
                        "room-1",
                        RoomAccessRevocationReason.MEMBERSHIP_BANNED);

        assertThat(summary.closedConnections()).isOne();
        verify(subscriptions).removeAll("connection-1");
        verify(active).deactivate("user-1", "connection-1");
        verify(transport).remove("connection-1");
    }

    @Test
    void failedCloseKeepsRegistriesForRetry() {
        when(active.findConnectionIdByUser("user-1"))
                .thenReturn(Optional.of("connection-1"));
        when(subscriptions.hasRoomSubscription(
                "connection-1",
                "room-1")).thenReturn(true);
        when(transport.close(
                "connection-1",
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED))
                .thenReturn(TransportSessionCloseResult.FAILED);

        RoomAccessRevocationSummary summary =
                revoker.revokeUserRoomAccess(
                        "user-1",
                        "room-1",
                        RoomAccessRevocationReason.MEMBERSHIP_LEFT);

        assertThat(summary.failedConnections()).isOne();
        verify(subscriptions, never()).removeAll("connection-1");
        verify(transport, never()).remove("connection-1");
    }

    @Test
    void roomRevocationClosesDistinctConnectionsAndContinuesOnFailure() {
        when(subscriptions.findConnectionIdsByRoom("room-1"))
                .thenReturn(Set.of(
                        "connection-1",
                        "connection-2",
                        "connection-3"));
        when(transport.close(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq(
                        WebSocketRoomAccessRevoker.ROOM_CLOSED)))
                .thenAnswer(invocation ->
                        invocation.getArgument(0).equals("connection-3")
                                ? TransportSessionCloseResult.FAILED
                                : TransportSessionCloseResult.CLOSED);

        RoomAccessRevocationSummary summary =
                revoker.revokeRoomAccess(
                        "room-1",
                        RoomAccessRevocationReason.ROOM_CLOSED);

        assertThat(summary.matchedConnections()).isEqualTo(3);
        assertThat(summary.closedConnections()).isEqualTo(2);
        assertThat(summary.failedConnections()).isOne();
        verify(transport, never()).remove("connection-3");
    }

    @Test
    void actualRegistriesCloseOnlyMatchingRoomSubscriber()
            throws Exception {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        ConnectionLimitProperties connectionProperties =
                new ConnectionLimitProperties();
        connectionProperties.setMaxActiveAuthenticated(10);
        InMemoryActiveConnectionRegistry actualActive =
                new InMemoryActiveConnectionRegistry(
                        connectionProperties,
                        meterRegistry);
        SubscriptionLimitProperties subscriptionProperties =
                new SubscriptionLimitProperties();
        InMemoryChatSubscriptionRegistry actualSubscriptions =
                new InMemoryChatSubscriptionRegistry(
                        subscriptionProperties,
                        meterRegistry);
        TransportSessionRegistry actualTransport =
                new TransportSessionRegistry(meterRegistry);

        WebSocketSession roomSession = session(
                "connection-1",
                true);
        WebSocketSession personalOnlySession = session(
                "connection-2",
                true);
        actualTransport.register(roomSession);
        actualTransport.register(personalOnlySession);
        actualActive.activate("user-1", "connection-1");
        actualActive.activate("user-2", "connection-2");
        actualSubscriptions.register(
                "connection-1",
                new SubscriptionDescriptor(
                        "sub-1",
                        "/topic/rooms/room-1/messages",
                        DestinationKind.TOPIC_ROOM_MESSAGES,
                        "room-1"));
        actualSubscriptions.register(
                "connection-2",
                new SubscriptionDescriptor(
                        "sub-2",
                        "/user/queue/command-results",
                        DestinationKind.USER_COMMAND_RESULTS,
                        null));

        WebSocketRoomAccessRevoker actualRevoker =
                new WebSocketRoomAccessRevoker(
                        actualActive,
                        actualSubscriptions,
                        actualTransport,
                        meterRegistry);
        RoomAccessRevocationSummary summary =
                actualRevoker.revokeRoomAccess(
                        "room-1",
                        RoomAccessRevocationReason.ROOM_CLOSED);

        assertThat(summary.closedConnections()).isOne();
        verify(roomSession).close(
                WebSocketRoomAccessRevoker.ROOM_CLOSED);
        verify(personalOnlySession, never()).close(
                org.mockito.ArgumentMatchers.any());
        assertThat(actualActive.findConnectionIdByUser("user-1"))
                .isEmpty();
        assertThat(actualActive.findConnectionIdByUser("user-2"))
                .contains("connection-2");
    }

    private static WebSocketSession session(
            String connectionId,
            boolean open
    ) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(connectionId);
        when(session.isOpen()).thenReturn(open);
        return session;
    }
}
