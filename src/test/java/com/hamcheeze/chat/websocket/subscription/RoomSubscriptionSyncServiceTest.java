package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.query.ChatMessageHistoryReader;
import com.hamcheeze.chat.room.authorization.RoomMessageAccess;
import com.hamcheeze.chat.room.authorization.RoomMessageAccessResolver;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RoomSubscriptionSyncServiceTest {

    private static final String REQUEST_ID =
            "550e8400-e29b-41d4-a716-446655440000";

    private final ChatSubscriptionRegistry subscriptions =
            mock(ChatSubscriptionRegistry.class);
    private final RoomMessageAccessResolver accessResolver =
            mock(RoomMessageAccessResolver.class);
    private final ChatMessageHistoryReader historyReader =
            mock(ChatMessageHistoryReader.class);
    private final SubscriptionResultSender resultSender =
            mock(SubscriptionResultSender.class);
    private final RoomSubscriptionSyncService service =
            new RoomSubscriptionSyncService(
                    subscriptions,
                    accessResolver,
                    historyReader,
                    resultSender);

    @Test
    void returnsReadyWithLatestCommittedSequence() {
        allowRequiredSubscriptions();
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(RoomMessageAccess.allowed(100));
        when(historyReader.findLatest("room-1", 0, 1))
                .thenReturn(List.of(message(120)));

        service.synchronize(
                "user-1",
                "connection-1",
                "room-1",
                new RoomSubscriptionSyncRequest(REQUEST_ID));

        RoomSubscriptionsReady ready = captureReady();
        assertThat(ready.status()).isEqualTo("READY");
        assertThat(ready.eventType())
                .isEqualTo("ROOM_SUBSCRIPTIONS_READY");
        assertThat(ready.requestId()).isEqualTo(REQUEST_ID);
        assertThat(ready.roomId()).isEqualTo("room-1");
        assertThat(ready.messageVisibleAfterSequence()).isEqualTo(100);
        assertThat(ready.watermarkSequence()).isEqualTo(120);
    }

    @Test
    void emptyRoomUsesZeroWatermark() {
        allowRequiredSubscriptions();
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(RoomMessageAccess.allowed(0));
        when(historyReader.findLatest("room-1", 0, 1))
                .thenReturn(List.of());

        service.synchronize(
                "user-1",
                "connection-1",
                "room-1",
                new RoomSubscriptionSyncRequest(REQUEST_ID));

        assertThat(captureReady().watermarkSequence())
                .isZero();
    }

    @Test
    void rejectsWhenEitherRoomTopicIsMissing() {
        when(subscriptions.hasRoomSubscription(
                "connection-1",
                "user-1",
                "room-1",
                DestinationKind.TOPIC_ROOM_MESSAGES))
                .thenReturn(true);
        when(subscriptions.hasRoomSubscription(
                "connection-1",
                "user-1",
                "room-1",
                DestinationKind.TOPIC_ROOM_EVENTS))
                .thenReturn(false);

        service.synchronize(
                "user-1",
                "connection-1",
                "room-1",
                new RoomSubscriptionSyncRequest(REQUEST_ID));

        RoomSubscriptionSyncRejected rejected =
                captureRejected();
        assertThat(rejected.code()).isEqualTo(
                RoomSubscriptionSyncErrorCode
                        .ROOM_SUBSCRIPTIONS_NOT_READY);
        assertThat(rejected.retryable()).isFalse();
        verifyNoInteractions(accessResolver, historyReader);
    }

    @Test
    void mapsAuthorizationAndWatermarkFailures() {
        allowRequiredSubscriptions();
        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(RoomMessageAccess.unavailable());

        service.synchronize(
                "user-1",
                "connection-1",
                "room-1",
                new RoomSubscriptionSyncRequest(REQUEST_ID));

        RoomSubscriptionSyncRejected unavailable =
                captureRejected();
        assertThat(unavailable.code()).isEqualTo(
                RoomSubscriptionSyncErrorCode
                        .ROOM_AUTHORIZATION_UNAVAILABLE);
        assertThat(unavailable.retryable()).isTrue();

        when(accessResolver.resolve("user-1", "room-1"))
                .thenReturn(RoomMessageAccess.allowed(100));
        when(historyReader.findLatest("room-1", 0, 1))
                .thenThrow(new IllegalStateException("mongo down"));

        service.synchronize(
                "user-1",
                "connection-1",
                "room-1",
                new RoomSubscriptionSyncRequest(REQUEST_ID));

        ArgumentCaptor<SubscriptionSystemEvent> events =
                ArgumentCaptor.forClass(
                        SubscriptionSystemEvent.class);
        verify(resultSender,
                org.mockito.Mockito.times(2))
                .send(
                        org.mockito.ArgumentMatchers.eq("user-1"),
                        org.mockito.ArgumentMatchers.eq(
                                "connection-1"),
                        events.capture());
        assertThat(events.getAllValues().getLast())
                .isInstanceOfSatisfying(
                        RoomSubscriptionSyncRejected.class,
                        rejected -> {
                            assertThat(rejected.code()).isEqualTo(
                                    RoomSubscriptionSyncErrorCode
                                            .ROOM_SUBSCRIPTION_SYNC_UNAVAILABLE);
                            assertThat(rejected.retryable()).isTrue();
                        });
    }

    @Test
    void rejectsInvalidRequestIdBeforeReadingState() {
        service.synchronize(
                "user-1",
                "connection-1",
                "room-1",
                new RoomSubscriptionSyncRequest("not-a-uuid"));

        assertThat(captureRejected().code()).isEqualTo(
                RoomSubscriptionSyncErrorCode
                        .INVALID_SYNC_REQUEST);
        verifyNoInteractions(
                subscriptions,
                accessResolver,
                historyReader);
    }

    private void allowRequiredSubscriptions() {
        when(subscriptions.hasRoomSubscription(
                "connection-1",
                "user-1",
                "room-1",
                DestinationKind.TOPIC_ROOM_MESSAGES))
                .thenReturn(true);
        when(subscriptions.hasRoomSubscription(
                "connection-1",
                "user-1",
                "room-1",
                DestinationKind.TOPIC_ROOM_EVENTS))
                .thenReturn(true);
    }

    private RoomSubscriptionsReady captureReady() {
        ArgumentCaptor<SubscriptionSystemEvent> event =
                ArgumentCaptor.forClass(
                        SubscriptionSystemEvent.class);
        verify(resultSender).send(
                eq("user-1"),
                eq("connection-1"),
                event.capture());
        assertThat(event.getValue())
                .isInstanceOf(RoomSubscriptionsReady.class);
        return (RoomSubscriptionsReady) event.getValue();
    }

    private RoomSubscriptionSyncRejected captureRejected() {
        ArgumentCaptor<SubscriptionSystemEvent> event =
                ArgumentCaptor.forClass(
                        SubscriptionSystemEvent.class);
        verify(resultSender).send(
                eq("user-1"),
                eq("connection-1"),
                event.capture());
        assertThat(event.getValue())
                .isInstanceOf(
                        RoomSubscriptionSyncRejected.class);
        return (RoomSubscriptionSyncRejected)
                event.getValue();
    }

    private ChatMessage message(long sequence) {
        return new ChatMessage(
                "message-" + sequence,
                "room-1",
                sequence,
                "user-1",
                "550e8400-e29b-41d4-a716-44665544%04d"
                        .formatted(sequence),
                "message " + sequence,
                Instant.parse("2026-07-29T00:00:00Z")
                        .plusSeconds(sequence));
    }
}
