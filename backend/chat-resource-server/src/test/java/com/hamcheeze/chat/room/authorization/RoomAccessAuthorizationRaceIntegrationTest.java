package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.application.ChatCommandRejected;
import com.hamcheeze.chat.application.ChatCommandRejectedCode;
import com.hamcheeze.chat.application.ChatCommandResult;
import com.hamcheeze.chat.application.ChatCommandResultSender;
import com.hamcheeze.chat.application.ChatCommandService;
import com.hamcheeze.chat.application.ChatCommandValidator;
import com.hamcheeze.chat.application.ChatSendCommand;
import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.application.RoomMessageSendAuthorization;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomCommandService;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import com.hamcheeze.chat.websocket.config.ChatAdmissionProperties;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.config.SubscriptionLimitProperties;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import com.hamcheeze.chat.websocket.protocol.DestinationPolicy;
import com.hamcheeze.chat.websocket.ratelimit.AdmissionOutcome;
import com.hamcheeze.chat.websocket.ratelimit.AdmissionReservation;
import com.hamcheeze.chat.websocket.ratelimit.ChatAdmissionLimiter;
import com.hamcheeze.chat.websocket.ratelimit.ConfiguredMessageTokenCostPolicy;
import com.hamcheeze.chat.websocket.subscription.InMemoryChatSubscriptionRegistry;
import com.hamcheeze.chat.websocket.subscription.SubscriptionPolicyInterceptor;
import com.hamcheeze.chat.websocket.subscription.SubscriptionRejected;
import com.hamcheeze.chat.websocket.subscription.SubscriptionRejectedCode;
import com.hamcheeze.chat.websocket.subscription.SubscriptionResultSender;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("local")
class RoomAccessAuthorizationRaceIntegrationTest
        extends MongoRuntimeIntegrationTest {

    private static final Duration WAIT = Duration.ofSeconds(10);

    @jakarta.annotation.Resource
    private RoomCommandService commandService;

    @jakarta.annotation.Resource
    private RoomAuthorizationService authorization;

    @jakarta.annotation.Resource
    private RoomMessageAccessResolver messageAccessResolver;

    @Test
    void subscribeVsLeaveCannotRetainLeftMembershipSubscription()
            throws Exception {
        assertSubscribeRace(AccessChange.LEAVE);
    }

    @Test
    void subscribeVsBanCannotRetainBannedMembershipSubscription()
            throws Exception {
        assertSubscribeRace(AccessChange.BAN);
    }

    @Test
    void subscribeVsCloseCannotRetainClosedRoomSubscription()
            throws Exception {
        assertSubscribeRace(AccessChange.CLOSE);
    }

    @Test
    void sendVsLeaveRejectsBeforePipelineAcceptance()
            throws Exception {
        assertSendRejectedAfterChange(AccessChange.LEAVE);
    }

    @Test
    void sendVsBanRejectsBeforePipelineAcceptance()
            throws Exception {
        assertSendRejectedAfterChange(AccessChange.BAN);
    }

    @Test
    void sendVsCloseRejectsBeforePipelineAcceptance()
            throws Exception {
        assertSendRejectedAfterChange(AccessChange.CLOSE);
    }

    @Test
    void pipelineAcceptanceBeforeLeaveRemainsAdmitted()
            throws Exception {
        RaceContext context = createContext(AccessChange.LEAVE);
        CountDownLatch pipelineEntered = new CountDownLatch(1);
        CountDownLatch mutationCommitted = new CountDownLatch(1);
        SendFixture fixture = new SendFixture(
                authorization,
                context.userId());
        when(fixture.pipeline.tryAccept(any())).thenAnswer(invocation -> {
            pipelineEntered.countDown();
            await(mutationCommitted);
            return PipelineAcceptance.ACCEPTED_FOR_PROCESSING;
        });

        CompletableFuture<Void> send = CompletableFuture.runAsync(
                () -> fixture.service.handle(
                        context.userId(),
                        "connection-1",
                        context.roomId(),
                        new ChatSendCommand(uuid(), "hello")));

        await(pipelineEntered);
        applyChange(context, AccessChange.LEAVE);
        mutationCommitted.countDown();
        send.get(WAIT.toSeconds(), TimeUnit.SECONDS);

        verify(fixture.pipeline).tryAccept(any());
        verify(fixture.reservation).commit();
        verify(fixture.reservation).close();
        verifyNoInteractions(fixture.resultSender);
        assertStateChanged(context, AccessChange.LEAVE);
    }

    private void assertSubscribeRace(AccessChange change)
            throws Exception {
        RaceContext context = createContext(change);
        BlockingMessageAccess blocking =
                new BlockingMessageAccess(messageAccessResolver);
        InMemoryChatSubscriptionRegistry subscriptions =
                new InMemoryChatSubscriptionRegistry(
                        new SubscriptionLimitProperties(),
                        new SimpleMeterRegistry());
        SubscriptionResultSender sender =
                mock(SubscriptionResultSender.class);
        SubscriptionPolicyInterceptor interceptor =
                new SubscriptionPolicyInterceptor(
                        new DestinationPolicy(
                        new ChatContentProperties()),
                        authorization,
                        blocking.resolver(),
                        subscriptions,
                        sender,
                        new SimpleMeterRegistry());

        CompletableFuture<Message<?>> subscribe =
                CompletableFuture.supplyAsync(() ->
                        interceptor.preSend(
                                subscribeMessage(
                                        context.userId(),
                                        context.roomId()),
                                null));

        blocking.awaitFirstDecision();
        applyChange(context, change);
        blocking.releaseFirstDecision();

        assertThat(subscribe.get(
                WAIT.toSeconds(),
                TimeUnit.SECONDS)).isNull();
        assertThat(subscriptions.findConnectionIdsByUserAndRoom(
                context.userId(),
                context.roomId())).isEmpty();
        assertThat(subscriptions.activeRoomSubscriberCount()).isZero();
        verify(sender).send(
                eq(context.userId()),
                eq("connection-1"),
                org.mockito.ArgumentMatchers.argThat(result ->
                        result instanceof SubscriptionRejected rejected
                                && rejected.code()
                                == SubscriptionRejectedCode
                                .ROOM_SUBSCRIPTION_FORBIDDEN));
        assertStateChanged(context, change);
    }

    private void assertSendRejectedAfterChange(AccessChange change)
            throws Exception {
        RaceContext context = createContext(change);
        BlockingSendAuthorization blocking =
                new BlockingSendAuthorization(authorization);
        SendFixture fixture = new SendFixture(
                blocking,
                context.userId());
        String clientMessageId = uuid();

        CompletableFuture<Void> send = CompletableFuture.runAsync(
                () -> fixture.service.handle(
                        context.userId(),
                        "connection-1",
                        context.roomId(),
                        new ChatSendCommand(
                                clientMessageId,
                                "hello")));

        if (!blocking.awaitSendAuthorization()) {
            throw new AssertionError(
                    "SEND completed before final authorization: done="
                            + send.isDone()
                            + ", result="
                            + fixture.sentResult.get());
        }
        applyChange(context, change);
        blocking.releaseSendAuthorization();
        send.get(WAIT.toSeconds(), TimeUnit.SECONDS);

        verify(fixture.pipeline, never()).tryAccept(any());
        verify(fixture.reservation, never()).commit();
        verify(fixture.reservation).close();
        var result = org.mockito.ArgumentCaptor.forClass(
                ChatCommandResult.class);
        verify(fixture.resultSender).send(
                eq(context.userId()),
                eq("connection-1"),
                result.capture());
        assertThat(result.getValue()).isEqualTo(
                new ChatCommandRejected(
                        clientMessageId,
                        ChatCommandRejectedCode.ROOM_SEND_FORBIDDEN,
                        false,
                        null));
        assertStateChanged(context, change);
    }

    private RaceContext createContext(AccessChange change) {
        String ownerUserId = "owner-" + UUID.randomUUID();
        String roomId = commandService.createRoom(
                        new CreateRoomCommand(
                                ownerUserId,
                                uuid(),
                                "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                                RoomVisibility.LISTED,
                                JoinPolicy.OPEN))
                .result()
                .roomId();
        if (change == AccessChange.CLOSE) {
            return new RaceContext(
                    roomId,
                    ownerUserId,
                    ownerUserId,
                    null);
        }
        String memberUserId = "member-" + UUID.randomUUID();
        String memberMembershipId = commandService.joinRoom(
                        new JoinRoomCommand(
                                memberUserId,
                                uuid(),
                                roomId))
                .result()
                .membershipId();
        return new RaceContext(
                roomId,
                ownerUserId,
                memberUserId,
                memberMembershipId);
    }

    private void applyChange(
            RaceContext context,
            AccessChange change
    ) {
        switch (change) {
            case LEAVE -> commandService.leaveRoom(
                    new LeaveRoomCommand(
                            context.userId(),
                            uuid(),
                            context.roomId()));
            case BAN -> commandService.banMember(
                    new BanMemberCommand(
                            context.ownerUserId(),
                            uuid(),
                            context.roomId(),
                            context.membershipId()));
            case CLOSE -> commandService.closeRoom(
                    new CloseRoomCommand(
                            context.ownerUserId(),
                            uuid(),
                            context.roomId()));
        }
    }

    private void assertStateChanged(
            RaceContext context,
            AccessChange change
    ) {
        if (change == AccessChange.CLOSE) {
            assertThat(roomStore.findById(context.roomId())
                    .orElseThrow().status())
                    .isEqualTo(RoomStatus.CLOSED);
            return;
        }
        assertThat(membershipStore.findByRoomIdAndUserId(
                context.roomId(),
                context.userId()).orElseThrow().status())
                .isEqualTo(change == AccessChange.LEAVE
                        ? MembershipStatus.LEFT
                        : MembershipStatus.BANNED);
    }

    private static Message<byte[]> subscribeMessage(
            String userId,
            String roomId
    ) {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(
                "/topic/rooms/" + roomId + "/messages");
        accessor.setSubscriptionId("sub-1");
        accessor.setSessionId("connection-1");
        accessor.setUser(
                UsernamePasswordAuthenticationToken.authenticated(
                        userId,
                        "n/a",
                        List.of()));
        return MessageBuilder.createMessage(
                new byte[0],
                accessor.getMessageHeaders());
    }

    private static String uuid() {
        return UUID.randomUUID().toString();
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(WAIT.toSeconds(), TimeUnit.SECONDS)) {
                throw new AssertionError("Timed out waiting for race boundary");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(
                    "Interrupted while waiting for race boundary",
                    exception);
        }
    }

    private enum AccessChange {
        LEAVE,
        BAN,
        CLOSE
    }

    private record RaceContext(
            String roomId,
            String ownerUserId,
            String userId,
            String membershipId
    ) {
    }

    private static final class BlockingMessageAccess {

        private final RoomMessageAccessResolver resolver =
                mock(RoomMessageAccessResolver.class);
        private final AtomicBoolean first =
                new AtomicBoolean(true);
        private final CountDownLatch firstDecision =
                new CountDownLatch(1);
        private final CountDownLatch release =
                new CountDownLatch(1);

        private BlockingMessageAccess(
                RoomMessageAccessResolver delegate
        ) {
            when(resolver.resolve(anyString(), anyString()))
                    .thenAnswer(invocation -> {
                        RoomMessageAccess access = delegate.resolve(
                                invocation.getArgument(0),
                                invocation.getArgument(1));
                        if (first.compareAndSet(true, false)) {
                            firstDecision.countDown();
                            await(release);
                        }
                        return access;
                    });
        }

        private RoomMessageAccessResolver resolver() {
            return resolver;
        }

        private void awaitFirstDecision() {
            await(firstDecision);
        }

        private void releaseFirstDecision() {
            release.countDown();
        }
    }

    private static final class BlockingSendAuthorization
            implements RoomAuthorizationService {

        private final RoomAuthorizationService delegate;
        private final CountDownLatch sendAuthorization =
                new CountDownLatch(1);
        private final CountDownLatch release =
                new CountDownLatch(1);

        private BlockingSendAuthorization(
                RoomAuthorizationService delegate
        ) {
            this.delegate = delegate;
        }

        @Override
        public RoomAuthorizationDecision authorizeSubscription(
                String userId,
                String roomId
        ) {
            return delegate.authorizeSubscription(userId, roomId);
        }

        @Override
        public RoomMessageSendAuthorization
        authorizeMessageSendWithContext(
                String userId,
                String roomId
        ) {
            sendAuthorization.countDown();
            await(release);
            return delegate.authorizeMessageSendWithContext(
                    userId,
                    roomId);
        }

        private boolean awaitSendAuthorization() {
            return awaitResult(sendAuthorization);
        }

        private void releaseSendAuthorization() {
            release.countDown();
        }
    }

    private static final class SendFixture {

        private final ChatMessagePipeline pipeline =
                mock(ChatMessagePipeline.class);
        private final AdmissionReservation reservation =
                mock(AdmissionReservation.class);
        private final ChatCommandResultSender resultSender =
                mock(ChatCommandResultSender.class);
        private final AtomicReference<ChatCommandResult> sentResult =
                new AtomicReference<>();
        private final ChatCommandService service;

        private SendFixture(
                RoomAuthorizationService authorization,
                String userId
        ) {
            ActiveConnectionRegistry activeConnections =
                    mock(ActiveConnectionRegistry.class);
            ChatAdmissionLimiter limiter =
                    mock(ChatAdmissionLimiter.class);
            when(activeConnections.isActive(
                    eq(userId),
                    eq("connection-1"))).thenReturn(true);
            when(pipeline.availability())
                    .thenReturn(PipelineAvailability.AVAILABLE);
            when(reservation.outcome())
                    .thenReturn(AdmissionOutcome.GRANTED);
            when(reservation.granted()).thenReturn(true);
            when(limiter.tryReserve(eq(userId), eq(1)))
                    .thenReturn(reservation);
            org.mockito.Mockito.doAnswer(invocation -> {
                sentResult.set(invocation.getArgument(2));
                return null;
            }).when(resultSender).send(
                    anyString(),
                    anyString(),
                    any(ChatCommandResult.class));
            service = new ChatCommandService(
                    activeConnections,
                    new ChatCommandValidator(
                            new ChatContentProperties()),
                    authorization,
                    pipeline,
                    new ConfiguredMessageTokenCostPolicy(
                            new ChatAdmissionProperties()),
                    limiter,
                    resultSender);
        }
    }

    private static boolean awaitResult(CountDownLatch latch) {
        try {
            return latch.await(WAIT.toSeconds(), TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(
                    "Interrupted while waiting for race boundary",
                    exception);
        }
    }
}
