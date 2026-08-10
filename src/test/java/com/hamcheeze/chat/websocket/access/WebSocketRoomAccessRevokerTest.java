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
import static org.mockito.Mockito.inOrder;
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
        when(subscriptions.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).thenReturn(Set.of());

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
        when(subscriptions.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).thenReturn(Set.of("connection-1"));
        when(active.findUserIdByConnection("connection-1"))
                .thenReturn(Optional.of("user-1"));
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
        org.mockito.InOrder order = inOrder(subscriptions, transport);
        order.verify(subscriptions).markRoomAccessRevoked(
                "connection-1", "room-1");
        order.verify(transport).close(
                "connection-1",
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED);
        verify(subscriptions).removeAll("connection-1");
        verify(active).deactivate("user-1", "connection-1");
        verify(transport).remove("connection-1");
    }

    @Test
    void failedCloseKeepsRegistriesForRetry() {
        when(subscriptions.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).thenReturn(Set.of("connection-1"));
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
        verify(subscriptions).markRoomAccessRevoked(
                "connection-1", "room-1");
        verify(subscriptions, never()).removeAll("connection-1");
        verify(transport, never()).remove("connection-1");
    }

    @Test
    void alreadyClosedOrMissingTransportStillCleansRegistries() {
        when(subscriptions.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).thenReturn(Set.of("connection-1"));
        when(active.findUserIdByConnection("connection-1"))
                .thenReturn(Optional.of("user-1"));
        when(transport.close(
                "connection-1",
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED))
                .thenReturn(
                        TransportSessionCloseResult
                                .ALREADY_CLOSED_OR_MISSING);

        RoomAccessRevocationSummary summary =
                revoker.revokeUserRoomAccess(
                        "user-1",
                        "room-1",
                        RoomAccessRevocationReason.MEMBERSHIP_LEFT);

        assertThat(summary.alreadyClosedOrMissingConnections()).isOne();
        verify(subscriptions).markRoomAccessRevoked(
                "connection-1", "room-1");
        verify(subscriptions).removeAll("connection-1");
        verify(active).deactivate("user-1", "connection-1");
        verify(transport).remove("connection-1");
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
                        "user-1",
                        "/topic/rooms/room-1/messages",
                        DestinationKind.TOPIC_ROOM_MESSAGES,
                        "room-1",
                        0L));
        actualSubscriptions.register(
                "connection-2",
                new SubscriptionDescriptor(
                        "sub-2",
                        "user-2",
                        "/user/queue/command-results",
                        DestinationKind.USER_COMMAND_RESULTS,
                        null,
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

    @Test
    void stalePreviousRoomConnectionIsRevokedAndCurrentMappingSurvives()
            throws Exception {
        ActualFixture fixture = new ActualFixture();
        WebSocketSession staleSession =
                fixture.registerSession("connection-1");
        fixture.active.activate("user-1", "connection-1");
        fixture.subscribe(
                "connection-1",
                "user-1",
                "sub-1",
                "room-1");
        fixture.active.activate("user-1", "connection-2");
        fixture.registerSession("connection-2");

        RoomAccessRevocationSummary summary =
                fixture.revoker.revokeUserRoomAccess(
                        "user-1",
                        "room-1",
                        RoomAccessRevocationReason.MEMBERSHIP_LEFT);

        assertThat(summary.matchedConnections()).isOne();
        assertThat(summary.closedConnections()).isOne();
        verify(staleSession).close(
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED);
        assertThat(fixture.subscriptions.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).isEmpty();
        assertThat(fixture.active.findConnectionIdByUser("user-1"))
                .contains("connection-2");
    }

    @Test
    void revokesEveryRoomConnectionOwnedBySameUser()
            throws Exception {
        ActualFixture fixture = new ActualFixture();
        WebSocketSession staleSession =
                fixture.registerSession("connection-1");
        fixture.active.activate("user-1", "connection-1");
        fixture.subscribe(
                "connection-1",
                "user-1",
                "sub-1",
                "room-1");
        WebSocketSession currentSession =
                fixture.registerSession("connection-2");
        fixture.active.activate("user-1", "connection-2");
        fixture.subscribe(
                "connection-2",
                "user-1",
                "sub-2",
                "room-1");

        RoomAccessRevocationSummary summary =
                fixture.revoker.revokeUserRoomAccess(
                        "user-1",
                        "room-1",
                        RoomAccessRevocationReason.MEMBERSHIP_BANNED);

        assertThat(summary.matchedConnections()).isEqualTo(2);
        assertThat(summary.closedConnections()).isEqualTo(2);
        verify(staleSession).close(
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED);
        verify(currentSession).close(
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED);
        assertThat(fixture.active.findConnectionIdByUser("user-1"))
                .isEmpty();
    }

    @Test
    void failedStaleCloseKeepsSubscriptionAndTransportForRetry() {
        ActualFixture fixture = new ActualFixture();
        WebSocketSession staleSession = mock(WebSocketSession.class);
        when(staleSession.getId()).thenReturn("connection-1");
        when(staleSession.isOpen()).thenReturn(true);
        try {
            org.mockito.Mockito.doThrow(
                            new java.io.IOException("close failed"))
                    .doNothing()
                    .when(staleSession)
                    .close(WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED);
        } catch (java.io.IOException exception) {
            throw new AssertionError(exception);
        }
        fixture.transport.register(staleSession);
        fixture.active.activate("user-1", "connection-1");
        fixture.subscribe(
                "connection-1",
                "user-1",
                "sub-1",
                "room-1");
        fixture.active.activate("user-1", "connection-2");

        RoomAccessRevocationSummary summary =
                fixture.revoker.revokeUserRoomAccess(
                        "user-1",
                        "room-1",
                        RoomAccessRevocationReason.MEMBERSHIP_LEFT);

        assertThat(summary.failedConnections()).isOne();
        assertThat(fixture.subscriptions.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).containsExactly("connection-1");
        assertThat(fixture.subscriptions.find(
                "connection-1", "sub-1"))
                .get()
                .extracting(SubscriptionDescriptor::roomAccessRevoked)
                .isEqualTo(true);
        assertThat(fixture.active.findConnectionIdByUser("user-1"))
                .contains("connection-2");

        RoomAccessRevocationSummary retry =
                fixture.revoker.revokeUserRoomAccess(
                        "user-1",
                        "room-1",
                        RoomAccessRevocationReason.MEMBERSHIP_LEFT);

        assertThat(retry.closedConnections()).isOne();
        assertThat(fixture.subscriptions.findConnectionIdsByUserAndRoom(
                "user-1", "room-1")).isEmpty();
        assertThat(fixture.transport.remove("connection-1")).isFalse();
    }

    @Test
    void staleRevocationClosesOldBoundaryAndPreservesCurrentBoundary()
            throws Exception {
        ActualFixture fixture = new ActualFixture();
        WebSocketSession staleSession =
                fixture.registerSession("connection-1");
        fixture.active.activate("user-1", "connection-1");
        fixture.subscribe(
                "connection-1",
                "user-1",
                "sub-old",
                "room-1",
                100L);
        WebSocketSession currentSession =
                fixture.registerSession("connection-2");
        fixture.active.activate("user-1", "connection-2");
        fixture.subscribe(
                "connection-2",
                "user-1",
                "sub-current",
                "room-1",
                150L);

        RoomAccessRevocationSummary summary =
                fixture.revoker.revokeStaleUserRoomAccess(
                        "user-1",
                        "room-1",
                        150L,
                        RoomAccessRevocationReason.MEMBERSHIP_REJOINED);

        assertThat(summary.matchedConnections()).isOne();
        assertThat(summary.closedConnections()).isOne();
        verify(staleSession).close(
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED);
        verify(currentSession, never()).close(
                org.mockito.ArgumentMatchers.any());
        assertThat(fixture.subscriptions.findConnectionIdsByUserAndRoom(
                "user-1", "room-1")).containsExactly("connection-2");
        assertThat(fixture.subscriptions.find(
                "connection-2", "sub-current"))
                .get()
                .extracting(SubscriptionDescriptor::roomAccessRevoked)
                .isEqualTo(false);
    }

    @Test
    void staleRevocationClosesEventOnlySubscriptionWithOldBoundary()
            throws Exception {
        ActualFixture fixture = new ActualFixture();
        WebSocketSession session =
                fixture.registerSession("connection-1");
        fixture.active.activate("user-1", "connection-1");
        fixture.subscriptions.register(
                "connection-1",
                new SubscriptionDescriptor(
                        "sub-events",
                        "user-1",
                        "/topic/rooms/room-1/room-events",
                        DestinationKind.TOPIC_ROOM_EVENTS,
                        "room-1",
                        100L));

        assertThat(fixture.revoker.revokeStaleUserRoomAccess(
                "user-1",
                "room-1",
                150L,
                RoomAccessRevocationReason.MEMBERSHIP_REJOINED))
                .extracting(RoomAccessRevocationSummary::closedConnections)
                .isEqualTo(1);
        verify(session).close(
                WebSocketRoomAccessRevoker.ROOM_ACCESS_REVOKED);
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

    private static final class ActualFixture {

        private final SimpleMeterRegistry meterRegistry =
                new SimpleMeterRegistry();
        private final InMemoryActiveConnectionRegistry active;
        private final InMemoryChatSubscriptionRegistry subscriptions;
        private final TransportSessionRegistry transport;
        private final WebSocketRoomAccessRevoker revoker;

        private ActualFixture() {
            ConnectionLimitProperties connectionProperties =
                    new ConnectionLimitProperties();
            connectionProperties.setMaxActiveAuthenticated(10);
            active = new InMemoryActiveConnectionRegistry(
                    connectionProperties,
                    meterRegistry);
            subscriptions = new InMemoryChatSubscriptionRegistry(
                    new SubscriptionLimitProperties(),
                    meterRegistry);
            transport = new TransportSessionRegistry(meterRegistry);
            revoker = new WebSocketRoomAccessRevoker(
                    active,
                    subscriptions,
                    transport,
                    meterRegistry);
        }

        private WebSocketSession registerSession(String connectionId) {
            WebSocketSession session = session(connectionId, true);
            transport.register(session);
            return session;
        }

        private void subscribe(
                String connectionId,
                String userId,
                String subscriptionId,
                String roomId
        ) {
            subscribe(
                    connectionId,
                    userId,
                    subscriptionId,
                    roomId,
                    0L);
        }

        private void subscribe(
                String connectionId,
                String userId,
                String subscriptionId,
                String roomId,
                long boundary
        ) {
            subscriptions.register(
                    connectionId,
                    new SubscriptionDescriptor(
                            subscriptionId,
                            userId,
                            "/topic/rooms/" + roomId + "/messages",
                            DestinationKind.TOPIC_ROOM_MESSAGES,
                            roomId,
                            boundary));
        }
    }
}
