package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxEvent;
import com.hamcheeze.chat.message.outbox.ClaimedChatMessageOutboxEvent;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.RoomMembershipProperties;
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoomInboxNotificationPipelineTest {

    private static final Instant NOW =
            Instant.parse("2026-08-03T01:00:00Z");

    @Test
    void coalescesCreatesPerRecipientAndUsesLatestHint()
            throws Exception {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        ActiveConnectionRegistry activeConnections =
                mock(ActiveConnectionRegistry.class);
        Membership owner = membership(
                "membership-owner", "owner", MembershipRole.OWNER);
        Membership member = membership(
                "membership-member", "member", MembershipRole.MEMBER);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room()));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 50))
                .thenReturn(new CursorSlice<>(
                        List.of(owner, member), false));
        when(activeConnections.findConnectionIdByUser("owner"))
                .thenReturn(Optional.empty());
        when(activeConnections.findConnectionIdByUser("member"))
                .thenReturn(Optional.of("connection-1"));
        when(activeConnections.isActive("member", "connection-1"))
                .thenReturn(true);
        List<RoomInboxEvent> delivered =
                Collections.synchronizedList(new ArrayList<>());
        CountDownLatch deliveryLatch = new CountDownLatch(1);
        RoomInboxEventDelivery delivery = (userId, connectionId, event) -> {
            delivered.add(event);
            deliveryLatch.countDown();
            return true;
        };
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification().setCoalescingWindowMs(25);
        RoomInboxNotificationPipeline pipeline =
                new RoomInboxNotificationPipeline(
                        roomReader,
                        activeConnections,
                        delivery,
                        properties,
                        new RoomMembershipProperties(),
                        Clock.fixed(NOW, ZoneOffset.UTC),
                        new SimpleMeterRegistry());

        pipeline.start();
        try {
            pipeline.onPublished(claimed(1), envelope(1, "first"));
            pipeline.onPublished(claimed(2), envelope(2, "second"));

            assertThat(deliveryLatch.await(2, TimeUnit.SECONDS))
                    .isTrue();
        } finally {
            pipeline.stop();
        }

        assertThat(delivered).singleElement().satisfies(event -> {
            assertThat(event.cause())
                    .isEqualTo(RoomInboxEvent.Cause.MESSAGE_CREATED);
            assertThat(event.coalescedCreateCount()).isEqualTo(2);
            assertThat(event.sourceEventIds()).hasSize(2);
            assertThat(event.notificationHint().messageId())
                    .isEqualTo("message-2");
            assertThat(event.notificationHint().preview())
                    .isEqualTo("second");
        });
        verify(roomReader).findRoomById("room-1");
        verify(roomReader).findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 50);
    }

    @Test
    void sameMessageCreateThenDeleteSuppressesToastAndKeepsInvalidation()
            throws Exception {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        ActiveConnectionRegistry activeConnections =
                mock(ActiveConnectionRegistry.class);
        Membership owner = membership(
                "membership-owner", "owner", MembershipRole.OWNER);
        Membership member = membership(
                "membership-member", "member", MembershipRole.MEMBER);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room()));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 50))
                .thenReturn(new CursorSlice<>(
                        List.of(owner, member), false));
        when(activeConnections.findConnectionIdByUser("owner"))
                .thenReturn(Optional.empty());
        when(activeConnections.findConnectionIdByUser("member"))
                .thenReturn(Optional.of("connection-1"));
        when(activeConnections.isActive("member", "connection-1"))
                .thenReturn(true);
        List<RoomInboxEvent> delivered =
                Collections.synchronizedList(new ArrayList<>());
        CountDownLatch deliveryLatch = new CountDownLatch(1);
        RoomInboxEventDelivery delivery = (userId, connectionId, event) -> {
            delivered.add(event);
            deliveryLatch.countDown();
            return true;
        };
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification().setCoalescingWindowMs(25);
        RoomInboxNotificationPipeline pipeline = pipeline(
                roomReader,
                activeConnections,
                delivery,
                properties,
                new SimpleMeterRegistry());

        pipeline.start();
        try {
            pipeline.onPublished(claimed(1), envelope(1, "first"));
            pipeline.onPublished(
                    deletedClaimed(1), deletedEnvelope(1));

            assertThat(deliveryLatch.await(2, TimeUnit.SECONDS))
                    .isTrue();
        } finally {
            pipeline.stop();
        }

        assertThat(delivered).singleElement().satisfies(event -> {
            assertThat(event.cause())
                    .isEqualTo(RoomInboxEvent.Cause.MESSAGE_DELETED);
            assertThat(event.notificationHint()).isNull();
            assertThat(event.coalescedCreateCount()).isNull();
            assertThat(event.sourceEventIds())
                    .containsExactly(ChatMessageOutboxEvent
                            .messageDeletedEventId("message-1", 2));
        });
    }

    @Test
    void fullQueueDropsIntentWithoutAffectingObserverCaller() {
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification().setQueueCapacity(1);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        RoomInboxNotificationPipeline pipeline = pipeline(
                mock(RoomQueryReader.class),
                mock(ActiveConnectionRegistry.class),
                (userId, connectionId, event) -> true,
                properties,
                meterRegistry);

        pipeline.onPublished(claimed(1), envelope(1, "first"));
        pipeline.onPublished(claimed(2), envelope(2, "second"));

        assertThat(meterRegistry.counter(
                "room.inbox.notification.enqueued").count())
                .isEqualTo(1);
        assertThat(meterRegistry.counter(
                "room.inbox.notification.enqueue.dropped").count())
                .isEqualTo(1);
    }

    private RoomInboxNotificationPipeline pipeline(
            RoomQueryReader roomReader,
            ActiveConnectionRegistry activeConnections,
            RoomInboxEventDelivery delivery,
            RoomInboxProperties properties,
            SimpleMeterRegistry meterRegistry
    ) {
        return new RoomInboxNotificationPipeline(
                roomReader,
                activeConnections,
                delivery,
                properties,
                new RoomMembershipProperties(),
                Clock.fixed(NOW, ZoneOffset.UTC),
                meterRegistry);
    }

    private ClaimedChatMessageOutboxEvent claimed(long sequence) {
        String messageId = "message-" + sequence;
        return new ClaimedChatMessageOutboxEvent(
                ChatMessageOutboxEvent.messageCreatedEventId(messageId),
                1,
                ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION,
                ChatMessageOutboxEvent.AGGREGATE_TYPE,
                messageId,
                ChatMessageOutboxEvent.CURRENT_EVENT_VERSION,
                ChatMessageOutboxEvent.MESSAGE_CREATED,
                "room-1",
                sequence,
                new ClaimedChatMessageOutboxEvent.Payload(
                        messageId,
                        "room-1",
                        sequence,
                        "owner",
                        "client-" + sequence,
                        sequence == 1 ? "first" : "second",
                        NOW),
                NOW);
    }

    private ChatMessageEventEnvelope envelope(
            long sequence,
            String content
    ) {
        return new ChatMessageEventEnvelope(
                1,
                ChatMessageOutboxEvent.MESSAGE_CREATED,
                new ChatMessagePayload(
                        "message-" + sequence,
                        "room-1",
                        sequence,
                        "owner",
                        "client-" + sequence,
                        content,
                        NOW));
    }

    private ClaimedChatMessageOutboxEvent deletedClaimed(long sequence) {
        String messageId = "message-" + sequence;
        return new ClaimedChatMessageOutboxEvent(
                ChatMessageOutboxEvent.messageDeletedEventId(
                        messageId, 2),
                1,
                ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION,
                ChatMessageOutboxEvent.AGGREGATE_TYPE,
                messageId,
                ChatMessageOutboxEvent.CURRENT_EVENT_VERSION,
                ChatMessageOutboxEvent.MESSAGE_DELETED,
                "room-1",
                sequence,
                new ClaimedChatMessageOutboxEvent.Payload(
                        messageId,
                        "room-1",
                        sequence,
                        "owner",
                        "client-" + sequence,
                        null,
                        MessageState.DELETED_BY_AUTHOR,
                        true,
                        2L,
                        NOW,
                        NOW,
                        NOW),
                NOW);
    }

    private ChatMessageEventEnvelope deletedEnvelope(long sequence) {
        return new ChatMessageEventEnvelope(
                1,
                ChatMessageOutboxEvent.MESSAGE_DELETED,
                new ChatMessagePayload(
                        "message-" + sequence,
                        "room-1",
                        sequence,
                        "owner",
                        "client-" + sequence,
                        null,
                        MessageState.DELETED_BY_AUTHOR,
                        true,
                        2,
                        NOW,
                        NOW,
                        NOW));
    }

    private Membership membership(
            String membershipId,
            String userId,
            MembershipRole role
    ) {
        return Membership.restore(
                membershipId,
                "room-1",
                userId,
                role,
                MembershipStatus.ACTIVE,
                NOW.minusSeconds(60),
                null,
                null,
                0,
                1);
    }

    private Room room() {
        return Room.restore(
                "room-1",
                "Room",
                "",
                "owner",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                2,
                NOW.minusSeconds(120),
                null,
                1);
    }
}
