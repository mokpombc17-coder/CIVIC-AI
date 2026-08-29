package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.delivery.ChatMessageBrokerHeaders;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationPort;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationReason;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationSummary;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryOutcome;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryPort;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionLifecycleInterceptor;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.connection.TransportSessionRegistry;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import com.hamcheeze.chat.websocket.subscription.ChatSubscriptionRegistry;
import com.hamcheeze.chat.websocket.subscription.RoomAccessQuarantineOutboundInterceptor;
import com.hamcheeze.chat.websocket.subscription.SubscriptionDescriptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("local")
class RoomCommandRevocationIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @jakarta.annotation.Resource
    private RoomCommandService commandService;

    @jakarta.annotation.Resource
    private RoomStore rooms;

    @jakarta.annotation.Resource
    private MembershipStore memberships;

    @jakarta.annotation.Resource
    private RoomCommandReceiptStore receipts;

    @jakarta.annotation.Resource
    private ChatMessageStore messageStore;

    @jakarta.annotation.Resource
    private ActiveConnectionRegistry activeConnections;

    @jakarta.annotation.Resource
    private ChatSubscriptionRegistry subscriptions;

    @jakarta.annotation.Resource
    private TransportSessionRegistry transportSessions;

    @jakarta.annotation.Resource
    private ActiveConnectionLifecycleInterceptor connectionLifecycle;

    @jakarta.annotation.Resource
    private RoomAccessQuarantineOutboundInterceptor quarantineInterceptor;

    @MockitoSpyBean
    private RoomAccessRevocationPort revocationPort;

    @MockitoSpyBean
    private RoomAccessReader accessReader;

    @MockitoSpyBean
    private RoomEventDeliveryPort eventDeliveryPort;

    @BeforeEach
    void isolateEventDeliveryFromBroker() {
        doReturn(RoomEventDeliveryOutcome.ACCEPTED)
                .when(eventDeliveryPort)
                .publishToRoom(any());
        doReturn(RoomEventDeliveryOutcome.ACCEPTED)
                .when(eventDeliveryPort)
                .publishToUser(any(), any());
    }

    @Test
    void leaveCommitsBeforeRevocationAndSameKeyRetriesOnlyRevocation() {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        clearInvocations(eventDeliveryPort);
        String requestId = uuid();
        LeaveRoomCommand command =
                new LeaveRoomCommand("user-2", requestId, roomId);
        failThenSucceedUser(
                "user-2",
                roomId,
                RoomAccessRevocationReason.MEMBERSHIP_LEFT);

        assertThatThrownBy(() -> commandService.leaveRoom(command))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> assertThat(exception.kind())
                                .isEqualTo(RoomCommandFailureKind
                                        .ACCESS_REVOCATION_FAILED));

        var committed = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow();
        long roomVersion = rooms.findById(roomId)
                .orElseThrow().version();
        assertThat(committed.status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(receipts.findByRequest("user-2", requestId))
                .isPresent();

        RoomCommandExecution replay =
                commandService.leaveRoom(command);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version())
                .isEqualTo(committed.version());
        verify(eventDeliveryPort, times(1)).publishToRoom(any());
        verify(eventDeliveryPort, times(1))
                .publishToUser(eq("user-2"), any());
    }

    @Test
    void banFailureReplaysReceiptAndRetriesRevocation() {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        String targetMembershipId = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow()
                .membershipId();
        clearInvocations(eventDeliveryPort);
        String requestId = uuid();
        BanMemberCommand command = new BanMemberCommand(
                "owner-1",
                requestId,
                roomId,
                targetMembershipId);
        failThenSucceedUser(
                "user-2",
                roomId,
                RoomAccessRevocationReason.MEMBERSHIP_BANNED);

        assertRevocationFailure(() -> commandService.banMember(command));
        long roomVersion =
                rooms.findById(roomId).orElseThrow().version();
        long membershipVersion = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version();
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().status())
                .isEqualTo(MembershipStatus.BANNED);

        RoomCommandExecution replay = commandService.banMember(command);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version())
                .isEqualTo(membershipVersion);
        verify(eventDeliveryPort, times(1)).publishToRoom(any());
        verify(eventDeliveryPort, times(1))
                .publishToUser(eq("user-2"), any());
    }

    @Test
    void closeFailureReplaysReceiptAndRetriesRoomRevocation() {
        String roomId = createRoom("owner-1");
        clearInvocations(eventDeliveryPort);
        String requestId = uuid();
        CloseRoomCommand command =
                new CloseRoomCommand("owner-1", requestId, roomId);
        doReturn(
                new RoomAccessRevocationSummary(1, 0, 0, 1),
                RoomAccessRevocationSummary.noOp())
                .when(revocationPort)
                .revokeRoomAccess(
                        roomId,
                        RoomAccessRevocationReason.ROOM_CLOSED);

        assertRevocationFailure(() -> commandService.closeRoom(command));
        long roomVersion =
                rooms.findById(roomId).orElseThrow().version();
        assertThat(rooms.findById(roomId).orElseThrow().status())
                .isEqualTo(RoomStatus.CLOSED);

        RoomCommandExecution replay = commandService.closeRoom(command);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
        verify(eventDeliveryPort, times(1)).publishToRoom(any());
        verify(eventDeliveryPort, times(1))
                .publishToUser(eq("owner-1"), any());
    }

    @Test
    void administratorCloseRevokesWholeRoomAccess() {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        clearInvocations(eventDeliveryPort, revocationPort);

        RoomCommandExecution execution =
                commandService.closeRoomAsAdministrator(
                        new CloseRoomCommand(
                                "administrator-1",
                                uuid(),
                                roomId));

        assertThat(execution.result().code().name())
                .isEqualTo("CLOSED");
        assertThat(memberships.findByRoomIdAndUserId(
                        roomId,
                        "owner-1")
                .orElseThrow().status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(memberships.findByRoomIdAndUserId(
                        roomId,
                        "user-2")
                .orElseThrow().status())
                .isEqualTo(MembershipStatus.LEFT);
        verify(revocationPort, times(1)).revokeRoomAccess(
                roomId,
                RoomAccessRevocationReason.ROOM_CLOSED);
    }

    @Test
    void failedReplacementCloseIsRetriedByLeaveReceiptReplay()
            throws Exception {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        String staleConnectionId = "stale-" + uuid();
        String currentConnectionId = "current-" + uuid();
        WebSocketSession staleSession = failingThenSucceedingSession(
                staleConnectionId,
                2);
        String subscriptionId = trackSubscribedConnection(
                staleSession,
                "user-2",
                roomId);

        connectionLifecycle.preSend(
                connect("user-2", currentConnectionId),
                null);

        assertThat(subscriptions.findConnectionIdsByUserAndRoom(
                "user-2",
                roomId)).containsExactly(staleConnectionId);
        clearInvocations(eventDeliveryPort);
        String requestId = uuid();
        LeaveRoomCommand command =
                new LeaveRoomCommand("user-2", requestId, roomId);
        doThrow(new IllegalStateException("access snapshot unavailable"))
                .when(accessReader)
                .readAccess("user-2", roomId);

        assertRevocationFailure(() -> commandService.leaveRoom(command));
        long roomVersion =
                rooms.findById(roomId).orElseThrow().version();
        long membershipVersion = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version();
        assertThat(subscriptions.findConnectionIdsByUserAndRoom(
                "user-2",
                roomId)).containsExactly(staleConnectionId);
        assertThat(subscriptions.find(staleConnectionId, subscriptionId))
                .get()
                .extracting(SubscriptionDescriptor::roomAccessRevoked)
                .isEqualTo(true);
        assertThat(quarantineInterceptor.preSend(
                outboundRoomMessage(
                        staleConnectionId,
                        subscriptionId,
                        roomId),
                null)).isNull();
        assertThat(activeConnections.findConnectionIdByUser("user-2"))
                .contains(currentConnectionId);

        RoomCommandExecution replay = commandService.leaveRoom(command);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version())
                .isEqualTo(membershipVersion);
        assertThat(subscriptions.findConnectionIdsByUserAndRoom(
                "user-2",
                roomId)).isEmpty();
        assertThat(activeConnections.findConnectionIdByUser("user-2"))
                .contains(currentConnectionId);
        verify(staleSession, org.mockito.Mockito.times(3))
                .close(any());
        verify(eventDeliveryPort, times(1)).publishToRoom(any());
        verify(eventDeliveryPort, times(1))
                .publishToUser(eq("user-2"), any());
    }

    @Test
    void failedBanCloseQuarantinesAndReceiptReplayCleansUp()
            throws Exception {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        String targetMembershipId = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow()
                .membershipId();
        String staleConnectionId = "stale-" + uuid();
        String currentConnectionId = "current-" + uuid();
        WebSocketSession staleSession = failingThenSucceedingSession(
                staleConnectionId,
                2);
        String subscriptionId = trackSubscribedConnection(
                staleSession,
                "user-2",
                roomId);

        connectionLifecycle.preSend(
                connect("user-2", currentConnectionId),
                null);
        clearInvocations(eventDeliveryPort);
        String requestId = uuid();
        BanMemberCommand command = new BanMemberCommand(
                "owner-1",
                requestId,
                roomId,
                targetMembershipId);
        doThrow(new IllegalStateException("access snapshot unavailable"))
                .when(accessReader)
                .readAccess("user-2", roomId);

        assertRevocationFailure(() -> commandService.banMember(command));
        long roomVersion =
                rooms.findById(roomId).orElseThrow().version();
        long membershipVersion = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version();
        assertThat(subscriptions.find(staleConnectionId, subscriptionId))
                .get()
                .extracting(SubscriptionDescriptor::roomAccessRevoked)
                .isEqualTo(true);
        assertThat(quarantineInterceptor.preSend(
                outboundRoomMessage(
                        staleConnectionId,
                        subscriptionId,
                        roomId),
                null)).isNull();

        RoomCommandExecution replay = commandService.banMember(command);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version())
                .isEqualTo(membershipVersion);
        assertThat(subscriptions.findConnectionIdsByUserAndRoom(
                "user-2",
                roomId)).isEmpty();
        assertThat(activeConnections.findConnectionIdByUser("user-2"))
                .contains(currentConnectionId);
        verify(staleSession, org.mockito.Mockito.times(3))
                .close(any());
        verify(eventDeliveryPort, times(1)).publishToRoom(any());
        verify(eventDeliveryPort, times(1))
                .publishToUser(eq("user-2"), any());
    }

    @Test
    void rejoinRetriesStaleBoundaryCloseAndPreservesFreshSubscription()
            throws Exception {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        String staleConnectionId = "stale-" + uuid();
        WebSocketSession staleSession = failingThenSucceedingSession(
                staleConnectionId,
                2);
        String staleSubscriptionId = trackSubscribedConnection(
                staleSession,
                "user-2",
                roomId);

        assertRevocationFailure(() -> commandService.leaveRoom(
                new LeaveRoomCommand("user-2", uuid(), roomId)));
        messageStore.append(new NewChatMessage(
                roomId,
                "owner-1",
                "membership-owner-1",
                uuid(),
                "while left"));
        String rejoinRequestId = uuid();
        JoinRoomCommand rejoin =
                new JoinRoomCommand(
                        "user-2",
                        rejoinRequestId,
                        roomId);

        assertRevocationFailure(() -> commandService.joinRoom(rejoin));

        var rejoined = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow();
        long roomVersion =
                rooms.findById(roomId).orElseThrow().version();
        assertThat(rejoined.status()).isEqualTo(MembershipStatus.ACTIVE);
        assertThat(rejoined.messageVisibleAfterSequence()).isEqualTo(1L);
        assertThat(subscriptions.find(
                staleConnectionId, staleSubscriptionId))
                .get()
                .extracting(SubscriptionDescriptor::roomAccessRevoked)
                .isEqualTo(true);

        RoomCommandExecution replay = commandService.joinRoom(rejoin);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version())
                .isEqualTo(rejoined.version());
        assertThat(subscriptions.findConnectionIdsByUserAndRoom(
                "user-2", roomId)).isEmpty();

        String freshConnectionId = "fresh-" + uuid();
        WebSocketSession freshSession =
                mock(WebSocketSession.class);
        when(freshSession.getId()).thenReturn(freshConnectionId);
        when(freshSession.isOpen()).thenReturn(true);
        String freshSubscriptionId = trackSubscribedConnection(
                freshSession,
                "user-2",
                roomId,
                rejoined.messageVisibleAfterSequence());

        assertThat(revocationPort.revokeStaleUserRoomAccess(
                "user-2",
                roomId,
                rejoined.messageVisibleAfterSequence(),
                RoomAccessRevocationReason.MEMBERSHIP_REJOINED))
                .isEqualTo(RoomAccessRevocationSummary.noOp());
        assertThat(subscriptions.find(
                freshConnectionId, freshSubscriptionId))
                .get()
                .extracting(SubscriptionDescriptor::roomAccessRevoked)
                .isEqualTo(false);
        verify(freshSession, org.mockito.Mockito.never()).close(any());
    }

    @Test
    void rejoinSnapshotFailureFallsBackToFullRevocationAndSucceeds()
            throws Exception {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        String staleConnectionId = "stale-" + uuid();
        WebSocketSession staleSession = failingThenSucceedingSession(
                staleConnectionId,
                1);
        String staleSubscriptionId = trackSubscribedConnection(
                staleSession,
                "user-2",
                roomId);

        assertRevocationFailure(() -> commandService.leaveRoom(
                new LeaveRoomCommand("user-2", uuid(), roomId)));
        assertThat(subscriptions.find(
                staleConnectionId, staleSubscriptionId))
                .get()
                .extracting(SubscriptionDescriptor::roomAccessRevoked)
                .isEqualTo(true);
        messageStore.append(new NewChatMessage(
                roomId,
                "owner-1",
                "membership-owner-1",
                uuid(),
                "while left"));
        doThrow(new IllegalStateException("access snapshot unavailable"))
                .when(accessReader)
                .readAccess("user-2", roomId);

        RoomCommandExecution rejoined =
                commandService.joinRoom(new JoinRoomCommand(
                        "user-2",
                        uuid(),
                        roomId));

        assertThat(rejoined.result().code().name())
                .isEqualTo("REJOINED");
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow()
                .messageVisibleAfterSequence())
                .isEqualTo(1L);
        assertThat(subscriptions.findConnectionIdsByUserAndRoom(
                "user-2", roomId)).isEmpty();
        verify(staleSession, org.mockito.Mockito.times(2))
                .close(any());
    }

    private String createRoom(String ownerUserId) {
        return commandService.createRoom(new CreateRoomCommand(
                        ownerUserId,
                        uuid(),
                        "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN))
                .result()
                .roomId();
    }

    private void join(String roomId, String userId) {
        commandService.joinRoom(new JoinRoomCommand(
                userId,
                uuid(),
                roomId));
    }

    private String trackSubscribedConnection(
            WebSocketSession session,
            String userId,
            String roomId
    ) {
        return trackSubscribedConnection(
                session, userId, roomId, 0L);
    }

    private String trackSubscribedConnection(
            WebSocketSession session,
            String userId,
            String roomId,
            long boundary
    ) {
        String subscriptionId = "sub-" + uuid();
        transportSessions.register(session);
        activeConnections.activate(userId, session.getId());
        subscriptions.register(
                session.getId(),
                new SubscriptionDescriptor(
                        subscriptionId,
                        userId,
                        "/topic/rooms/" + roomId + "/messages",
                        DestinationKind.TOPIC_ROOM_MESSAGES,
                        roomId,
                        boundary));
        return subscriptionId;
    }

    private static Message<byte[]> outboundRoomMessage(
            String connectionId,
            String subscriptionId,
            String roomId
    ) {
        SimpMessageHeaderAccessor accessor =
                SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        accessor.setSessionId(connectionId);
        accessor.setSubscriptionId(subscriptionId);
        accessor.setDestination(
                "/topic/rooms/" + roomId + "/messages");
        accessor.setHeader(
                ChatMessageBrokerHeaders.ROOM_SEQUENCE,
                Long.MAX_VALUE);
        return MessageBuilder.createMessage(
                new byte[0],
                accessor.getMessageHeaders());
    }

    private static WebSocketSession failingThenSucceedingSession(
            String connectionId,
            int failureCount
    ) throws IOException {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(connectionId);
        when(session.isOpen()).thenReturn(true);
        if (failureCount == 2) {
            doThrow(
                    new IOException("replacement close failed"),
                    new IOException("revocation close failed"))
                    .doNothing()
                    .when(session)
                    .close(any());
        } else {
            doThrow(new IOException("replacement close failed"))
                    .doNothing()
                    .when(session)
                    .close(any());
        }
        return session;
    }

    private static Message<byte[]> connect(
            String userId,
            String connectionId
    ) {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setSessionId(connectionId);
        accessor.setUser(
                UsernamePasswordAuthenticationToken.authenticated(
                        userId,
                        "n/a",
                        List.of()));
        return MessageBuilder.createMessage(
                new byte[0],
                accessor.getMessageHeaders());
    }

    private void failThenSucceedUser(
            String userId,
            String roomId,
            RoomAccessRevocationReason reason
    ) {
        doReturn(
                new RoomAccessRevocationSummary(1, 0, 0, 1),
                RoomAccessRevocationSummary.noOp())
                .when(revocationPort)
                .revokeUserRoomAccess(userId, roomId, reason);
    }

    private static void assertRevocationFailure(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable command
    ) {
        assertThatThrownBy(command)
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> assertThat(exception.kind())
                                .isEqualTo(RoomCommandFailureKind
                                        .ACCESS_REVOCATION_FAILED));
    }

    private static String uuid() {
        return UUID.randomUUID().toString();
    }
}
