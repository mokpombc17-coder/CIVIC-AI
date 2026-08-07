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
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

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
import static org.mockito.Mockito.never;
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
                "room-1", MembershipStatus.ACTIVE, null, 100))
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
        };
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification().setCoalescingWindowMs(25);
        RoomInboxNotificationPipeline pipeline =
                new RoomInboxNotificationPipeline(
                        roomReader,
                        mock(RoomInboxCurrentSummaryReader.class),
                        activeConnections,
                        delivery,
                        properties,
                        new ObjectMapper(),
                        new ChatContentProperties(),
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
                "room-1", MembershipStatus.ACTIVE, null, 100);
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
                "room-1", MembershipStatus.ACTIVE, null, 100))
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
        };
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification().setCoalescingWindowMs(25);
        properties.getNotification().setMaxEventsPerRoomBatch(1);
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
        verify(roomReader).findRoomById("room-1");
        verify(roomReader).findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100);
    }

    @Test
    void fullQueueDropsIntentWithoutAffectingObserverCaller() {
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification().setQueueCapacity(1);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        RoomInboxNotificationPipeline pipeline = pipeline(
                mock(RoomQueryReader.class),
                mock(ActiveConnectionRegistry.class),
                (userId, connectionId, event) -> {
                },
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

    @Test
    void globalWindowDeduplicatesBeforeCreateDeleteCancellation()
            throws Exception {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        ActiveConnectionRegistry connections = online("member");
        Membership owner = membership(
                "membership-owner", "owner", MembershipRole.OWNER);
        Membership member = membership(
                "membership-member", "member", MembershipRole.MEMBER);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room()));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(
                        List.of(owner, member), false));
        List<RoomInboxEvent> delivered = synchronizedEvents();
        CountDownLatch latch = new CountDownLatch(1);
        SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        RoomInboxProperties properties = properties();
        properties.getNotification().setMaxEventsPerRoomBatch(1);
        RoomInboxNotificationPipeline pipeline = pipeline(
                roomReader,
                connections,
                (userId, connectionId, event) -> {
                    delivered.add(event);
                    latch.countDown();
                },
                properties,
                metrics);

        pipeline.start();
        try {
            pipeline.onPublished(claimed(1), envelope(1, "first"));
            pipeline.onPublished(claimed(1), envelope(1, "first"));
            pipeline.onPublished(deletedClaimed(1), deletedEnvelope(1));
            assertThat(latch.await(2, TimeUnit.SECONDS)).isTrue();
        } finally {
            pipeline.stop();
        }

        assertThat(delivered).singleElement().satisfies(event ->
                assertThat(event.cause()).isEqualTo(
                        RoomInboxEvent.Cause.MESSAGE_DELETED));
        assertThat(metrics.counter(
                "room.inbox.notification.duplicate.source").count())
                .isEqualTo(1);
        verify(roomReader).findRoomById("room-1");
        verify(roomReader).findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100);
    }

    @Test
    void differentCreateAndDeleteProduceAtMostOneEventPerCause()
            throws Exception {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        Membership owner = membership(
                "membership-owner", "owner", MembershipRole.OWNER);
        Membership member = membership(
                "membership-member", "member", MembershipRole.MEMBER);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room()));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(
                        List.of(owner, member), false));
        List<RoomInboxEvent> delivered = synchronizedEvents();
        CountDownLatch latch = new CountDownLatch(2);
        RoomInboxNotificationPipeline pipeline = pipeline(
                roomReader,
                online("member"),
                (userId, connectionId, event) -> {
                    delivered.add(event);
                    latch.countDown();
                },
                properties(),
                new SimpleMeterRegistry());

        pipeline.start();
        try {
            pipeline.onPublished(claimed(1), envelope(1, "created"));
            pipeline.onPublished(deletedClaimed(2), deletedEnvelope(2));
            assertThat(latch.await(2, TimeUnit.SECONDS)).isTrue();
        } finally {
            pipeline.stop();
        }

        assertThat(delivered).extracting(RoomInboxEvent::cause)
                .containsExactlyInAnyOrder(
                        RoomInboxEvent.Cause.MESSAGE_CREATED,
                        RoomInboxEvent.Cause.MESSAGE_DELETED);
        verify(roomReader).findRoomById("room-1");
        verify(roomReader).findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100);
    }

    @Test
    void filtersBoundarySenderCountableOfflineAndInactiveRecipients() {
        assertNoDelivery(
                membership("boundary", "member", MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE, 1),
                online("member"),
                envelope(1, "first"),
                claimed(1),
                room(RoomStatus.ACTIVE, 1));
        assertNoDelivery(
                membership("membership-owner", "owner",
                        MembershipRole.OWNER,
                        MembershipStatus.ACTIVE, 0),
                online("owner"),
                envelope(1, "first"),
                claimed(1),
                room(RoomStatus.ACTIVE, 1));
        assertNoDelivery(
                membership("offline", "member", MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE, 0),
                mock(ActiveConnectionRegistry.class),
                envelope(1, "first"),
                claimed(1),
                room(RoomStatus.ACTIVE, 1));
        assertNoDelivery(
                membership("left", "member", MembershipRole.MEMBER,
                        MembershipStatus.LEFT, 0),
                online("member"),
                envelope(1, "first"),
                claimed(1),
                room(RoomStatus.ACTIVE, 1));
        assertNoDelivery(
                membership("banned", "member", MembershipRole.MEMBER,
                        MembershipStatus.BANNED, 0),
                online("member"),
                envelope(1, "first"),
                claimed(1),
                room(RoomStatus.ACTIVE, 1));
        assertNoDelivery(
                membership("uncountable", "member",
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE, 0),
                online("member"),
                envelope(1, "owner", false, "ignored"),
                claimed(1, "owner", false, "ignored"),
                room(RoomStatus.ACTIVE, 1));
        assertNoDelivery(
                membership("closed", "member", MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE, 0),
                online("member"),
                envelope(1, "first"),
                claimed(1),
                room(RoomStatus.CLOSED, 0));
    }

    @Test
    void inconsistentOrOversizedRecipientSnapshotFailsClosed() {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        RoomInboxEventDelivery delivery = mock(
                RoomInboxEventDelivery.class);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room(RoomStatus.ACTIVE, 2)));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(List.of(
                        membership("only", "member",
                                MembershipRole.MEMBER)), false));
        RoomInboxNotificationPipeline pipeline = pipeline(
                roomReader,
                online("member"),
                delivery,
                properties(),
                new SimpleMeterRegistry());

        runAndStop(pipeline, claimed(1), envelope(1, "first"));

        verify(delivery, never()).deliver(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any());

        RoomQueryReader pagedReader = mock(RoomQueryReader.class);
        when(pagedReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room(RoomStatus.ACTIVE, 1)));
        when(pagedReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(List.of(
                        membership("paged", "member",
                                MembershipRole.MEMBER)), true));
        RoomInboxEventDelivery pagedDelivery = mock(
                RoomInboxEventDelivery.class);
        RoomInboxNotificationPipeline paged = pipeline(
                pagedReader,
                online("member"),
                pagedDelivery,
                properties(),
                new SimpleMeterRegistry());

        runAndStop(paged, claimed(1), envelope(1, "first"));

        verify(pagedDelivery, never()).deliver(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any());

        RoomInboxProperties lowSafety = properties();
        lowSafety.getNotification().setMaxRecipientSnapshotSize(1);
        RoomQueryReader oversizedReader = mock(RoomQueryReader.class);
        when(oversizedReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room(RoomStatus.ACTIVE, 2)));
        RoomInboxEventDelivery oversizedDelivery = mock(
                RoomInboxEventDelivery.class);
        RoomInboxNotificationPipeline oversized = pipeline(
                oversizedReader,
                online("member"),
                oversizedDelivery,
                lowSafety,
                new SimpleMeterRegistry());

        runAndStop(oversized, claimed(1), envelope(1, "first"));

        verify(oversizedReader, never())
                .findMembershipsByRoomAndStatus(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.anyInt());
        verify(oversizedDelivery, never()).deliver(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void deliveryFailureForOneRecipientDoesNotStopNextRecipient()
            throws Exception {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        Membership owner = membership(
                "owner-membership", "owner", MembershipRole.OWNER);
        Membership first = membership(
                "first-membership", "first", MembershipRole.MEMBER);
        Membership second = membership(
                "second-membership", "second", MembershipRole.MEMBER);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room(RoomStatus.ACTIVE, 3)));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(
                        List.of(owner, first, second), false));
        ActiveConnectionRegistry connections = mock(
                ActiveConnectionRegistry.class);
        for (String user : List.of("first", "second")) {
            when(connections.findConnectionIdByUser(user))
                    .thenReturn(Optional.of("connection-" + user));
            when(connections.isActive(user, "connection-" + user))
                    .thenReturn(true);
        }
        CountDownLatch secondDelivered = new CountDownLatch(1);
        SimpleMeterRegistry metrics = new SimpleMeterRegistry();
        RoomInboxNotificationPipeline pipeline = pipeline(
                roomReader,
                connections,
                (userId, connectionId, event) -> {
                    if (userId.equals("first")) {
                        throw new IllegalStateException("delivery failed");
                    }
                    if (userId.equals("second")) {
                        secondDelivered.countDown();
                    }
                },
                properties(),
                metrics);

        pipeline.start();
        try {
            pipeline.onPublished(claimed(1), envelope(1, "first"));
            assertThat(secondDelivered.await(2, TimeUnit.SECONDS))
                    .isTrue();
            assertThat(pipeline.isRunning()).isTrue();
        } finally {
            pipeline.stop();
        }

        assertThat(metrics.counter(
                "room.inbox.notification.delivery.failure").count())
                .isEqualTo(1);
        assertThat(metrics.counter(
                "room.inbox.notification.delivery.success").count())
                .isEqualTo(1);
    }

    @Test
    void restoredRoomAboveConfiguredMembershipLimitUsesSafetyLimit()
            throws Exception {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        List<Membership> memberships = new ArrayList<>();
        memberships.add(membership(
                "owner-membership", "owner", MembershipRole.OWNER));
        memberships.add(membership(
                "target-membership", "target", MembershipRole.MEMBER));
        for (int index = 2; index < 51; index++) {
            memberships.add(membership(
                    "membership-" + index,
                    "offline-" + index,
                    MembershipRole.MEMBER));
        }
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room(RoomStatus.ACTIVE, 51)));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(memberships, false));
        CountDownLatch latch = new CountDownLatch(1);
        RoomInboxNotificationPipeline pipeline = pipeline(
                roomReader,
                online("target"),
                (userId, connectionId, event) -> latch.countDown(),
                properties(),
                new SimpleMeterRegistry());

        pipeline.start();
        try {
            pipeline.onPublished(claimed(1), envelope(1, "first"));
            assertThat(latch.await(2, TimeUnit.SECONDS)).isTrue();
        } finally {
            pipeline.stop();
        }
    }

    @Test
    void splitsFiveEligibleCreatesIntoDeterministicPublicEvents()
            throws Exception {
        RoomQueryReader reader = readerWithTargetMember();
        List<RoomInboxEvent> delivered = synchronizedEvents();
        CountDownLatch latch = new CountDownLatch(3);
        RoomInboxProperties properties = properties();
        properties.getNotification().setMaxEventsPerRoomBatch(2);
        RoomInboxNotificationPipeline pipeline = pipeline(
                reader,
                online("target"),
                (userId, connectionId, event) -> {
                    delivered.add(event);
                    latch.countDown();
                },
                properties,
                new SimpleMeterRegistry());

        pipeline.start();
        try {
            for (long sequence = 1; sequence <= 5; sequence++) {
                pipeline.onPublished(
                        claimed(sequence),
                        envelope(sequence, "message-" + sequence));
            }
            assertThat(latch.await(2, TimeUnit.SECONDS)).isTrue();
        } finally {
            pipeline.stop();
        }

        assertThat(delivered).hasSize(3);
        assertThat(delivered).extracting(value ->
                        value.sourceEventIds().size())
                .containsExactly(2, 2, 1);
        assertThat(delivered).extracting(
                        RoomInboxEvent::coalescedCreateCount)
                .containsExactly(2, 2, 1);
        assertThat(delivered).extracting(value ->
                        value.notificationHint().messageId())
                .containsExactly("message-2", "message-4", "message-5");
        assertThat(delivered.stream()
                .flatMap(value -> value.sourceEventIds().stream()))
                .containsExactly(
                        ChatMessageOutboxEvent.messageCreatedEventId(
                                "message-1"),
                        ChatMessageOutboxEvent.messageCreatedEventId(
                                "message-2"),
                        ChatMessageOutboxEvent.messageCreatedEventId(
                                "message-3"),
                        ChatMessageOutboxEvent.messageCreatedEventId(
                                "message-4"),
                        ChatMessageOutboxEvent.messageCreatedEventId(
                                "message-5"));
    }

    @Test
    void splitsFiveEligibleDeletesWithoutToastPayload()
            throws Exception {
        RoomQueryReader reader = readerWithTargetMember();
        List<RoomInboxEvent> delivered = synchronizedEvents();
        CountDownLatch latch = new CountDownLatch(3);
        RoomInboxProperties properties = properties();
        properties.getNotification().setMaxEventsPerRoomBatch(2);
        RoomInboxNotificationPipeline pipeline = pipeline(
                reader,
                online("target"),
                (userId, connectionId, event) -> {
                    delivered.add(event);
                    latch.countDown();
                },
                properties,
                new SimpleMeterRegistry());

        pipeline.start();
        try {
            for (long sequence = 1; sequence <= 5; sequence++) {
                pipeline.onPublished(
                        deletedClaimed(sequence),
                        deletedEnvelope(sequence));
            }
            assertThat(latch.await(2, TimeUnit.SECONDS)).isTrue();
        } finally {
            pipeline.stop();
        }

        assertThat(delivered).hasSize(3);
        assertThat(delivered).extracting(value ->
                        value.sourceEventIds().size())
                .containsExactly(2, 2, 1);
        assertThat(delivered).allSatisfy(event -> {
            assertThat(event.cause()).isEqualTo(
                    RoomInboxEvent.Cause.MESSAGE_DELETED);
            assertThat(event.roomNameHint()).isNull();
            assertThat(event.coalescedCreateCount()).isNull();
            assertThat(event.notificationHint()).isNull();
        });
        assertThat(delivered.stream()
                .flatMap(value -> value.sourceEventIds().stream()))
                .doesNotHaveDuplicates()
                .hasSize(5);
    }

    @Test
    void normalizesCreateDeleteBeforePublicEventSplitting()
            throws Exception {
        RoomQueryReader reader = readerWithTargetMember();
        List<RoomInboxEvent> delivered = synchronizedEvents();
        CountDownLatch latch = new CountDownLatch(2);
        RoomInboxProperties properties = properties();
        properties.getNotification().setMaxEventsPerRoomBatch(2);
        RoomInboxNotificationPipeline pipeline = pipeline(
                reader,
                online("target"),
                (userId, connectionId, event) -> {
                    delivered.add(event);
                    latch.countDown();
                },
                properties,
                new SimpleMeterRegistry());

        pipeline.start();
        try {
            for (long sequence = 1; sequence <= 3; sequence++) {
                pipeline.onPublished(
                        claimed(sequence),
                        envelope(sequence, "message-" + sequence));
            }
            pipeline.onPublished(deletedClaimed(1), deletedEnvelope(1));
            assertThat(latch.await(2, TimeUnit.SECONDS)).isTrue();
        } finally {
            pipeline.stop();
        }

        RoomInboxEvent created = delivered.stream()
                .filter(value -> value.cause()
                        == RoomInboxEvent.Cause.MESSAGE_CREATED)
                .findFirst().orElseThrow();
        RoomInboxEvent deleted = delivered.stream()
                .filter(value -> value.cause()
                        == RoomInboxEvent.Cause.MESSAGE_DELETED)
                .findFirst().orElseThrow();
        assertThat(created.sourceEventIds()).containsExactly(
                ChatMessageOutboxEvent.messageCreatedEventId("message-2"),
                ChatMessageOutboxEvent.messageCreatedEventId("message-3"));
        assertThat(deleted.sourceEventIds()).containsExactly(
                ChatMessageOutboxEvent.messageDeletedEventId(
                        "message-1", 2));
    }

    @Test
    void dropsOversizedPublicEventWithoutCallingDelivery() {
        RoomQueryReader reader = readerWithTargetMember();
        RoomInboxEventDelivery delivery = mock(
                RoomInboxEventDelivery.class);
        ChatContentProperties contentProperties =
                new ChatContentProperties();
        contentProperties.setMaxStompMessageBytes(1);
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        RoomInboxNotificationPipeline pipeline = pipeline(
                reader,
                online("target"),
                delivery,
                properties(),
                contentProperties,
                meters);

        runAndStop(pipeline, claimed(1), envelope(1, "message"));

        verify(delivery, never()).deliver(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any());
        assertThat(meters.counter(
                "room.inbox.notification.public_event.oversized").count())
                .isEqualTo(1);
    }

    @Test
    void sameSourceCanBeRedeliveredInDifferentWindows()
            throws Exception {
        RoomQueryReader reader = readerWithTargetMember();
        List<RoomInboxEvent> delivered = synchronizedEvents();
        CountDownLatch first = new CountDownLatch(1);
        CountDownLatch second = new CountDownLatch(2);
        RoomInboxNotificationPipeline pipeline = pipeline(
                reader,
                online("target"),
                (userId, connectionId, event) -> {
                    delivered.add(event);
                    first.countDown();
                    second.countDown();
                },
                properties(),
                new SimpleMeterRegistry());

        pipeline.start();
        try {
            pipeline.onPublished(claimed(1), envelope(1, "message"));
            assertThat(first.await(2, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(50);
            pipeline.onPublished(claimed(1), envelope(1, "message"));
            assertThat(second.await(2, TimeUnit.SECONDS)).isTrue();
        } finally {
            pipeline.stop();
        }

        assertThat(delivered).hasSize(2);
        assertThat(delivered).extracting(RoomInboxEvent::eventId)
                .doesNotHaveDuplicates();
        assertThat(delivered).extracting(RoomInboxEvent::sourceEventIds)
                .containsOnly(List.of(
                        ChatMessageOutboxEvent.messageCreatedEventId(
                                "message-1")));
    }

    private RoomInboxNotificationPipeline pipeline(
            RoomQueryReader roomReader,
            ActiveConnectionRegistry activeConnections,
            RoomInboxEventDelivery delivery,
            RoomInboxProperties properties,
            SimpleMeterRegistry meterRegistry
    ) {
        return pipeline(
                roomReader,
                activeConnections,
                delivery,
                properties,
                new ChatContentProperties(),
                meterRegistry);
    }

    private RoomInboxNotificationPipeline pipeline(
            RoomQueryReader roomReader,
            ActiveConnectionRegistry activeConnections,
            RoomInboxEventDelivery delivery,
            RoomInboxProperties properties,
            ChatContentProperties contentProperties,
            SimpleMeterRegistry meterRegistry
    ) {
        return new RoomInboxNotificationPipeline(
                roomReader,
                mock(RoomInboxCurrentSummaryReader.class),
                activeConnections,
                delivery,
                properties,
                new ObjectMapper(),
                contentProperties,
                Clock.fixed(NOW, ZoneOffset.UTC),
                meterRegistry);
    }

    private RoomQueryReader readerWithTargetMember() {
        RoomQueryReader reader = mock(RoomQueryReader.class);
        Membership owner = membership(
                "membership-owner", "owner", MembershipRole.OWNER);
        Membership target = membership(
                "membership-target", "target", MembershipRole.MEMBER);
        when(reader.findRoomById("room-1"))
                .thenReturn(Optional.of(room()));
        when(reader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(
                        List.of(owner, target), false));
        return reader;
    }

    private void assertNoDelivery(
            Membership membership,
            ActiveConnectionRegistry connections,
            ChatMessageEventEnvelope event,
            ClaimedChatMessageOutboxEvent claimed,
            Room room
    ) {
        RoomQueryReader reader = mock(RoomQueryReader.class);
        when(reader.findRoomById("room-1"))
                .thenReturn(Optional.of(room));
        when(reader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(
                        List.of(membership), false));
        List<RoomInboxEvent> delivered = synchronizedEvents();
        RoomInboxNotificationPipeline pipeline = pipeline(
                reader,
                connections,
                (userId, connectionId, value) -> delivered.add(value),
                properties(),
                new SimpleMeterRegistry());

        runAndStop(pipeline, claimed, event);

        assertThat(delivered).isEmpty();
    }

    private void runAndStop(
            RoomInboxNotificationPipeline pipeline,
            ClaimedChatMessageOutboxEvent claimed,
            ChatMessageEventEnvelope event
    ) {
        pipeline.start();
        try {
            pipeline.onPublished(claimed, event);
        } finally {
            pipeline.stop();
        }
    }

    private RoomInboxProperties properties() {
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification().setCoalescingWindowMs(25);
        return properties;
    }

    private ActiveConnectionRegistry online(String userId) {
        ActiveConnectionRegistry registry = mock(
                ActiveConnectionRegistry.class);
        when(registry.findConnectionIdByUser(userId))
                .thenReturn(Optional.of("connection-" + userId));
        when(registry.isActive(userId, "connection-" + userId))
                .thenReturn(true);
        return registry;
    }

    private List<RoomInboxEvent> synchronizedEvents() {
        return Collections.synchronizedList(new ArrayList<>());
    }

    private ClaimedChatMessageOutboxEvent claimed(long sequence) {
        return claimed(
                sequence,
                "owner",
                true,
                sequence == 1 ? "first" : "second");
    }

    private ClaimedChatMessageOutboxEvent claimed(
            long sequence,
            String senderUserId,
            boolean countable,
            String content
    ) {
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
                        "membership-" + senderUserId,
                        "client-" + sequence,
                        content,
                        MessageState.ACTIVE,
                        countable,
                        1L,
                        NOW,
                        NOW,
                        null),
                NOW);
    }

    private ChatMessageEventEnvelope envelope(
            long sequence,
            String content
    ) {
        return envelope(sequence, "owner", true, content);
    }

    private ChatMessageEventEnvelope envelope(
            long sequence,
            String senderUserId,
            boolean countable,
            String content
    ) {
        return new ChatMessageEventEnvelope(
                ChatMessageEventEnvelope.CURRENT_VERSION,
                ChatMessageOutboxEvent.MESSAGE_CREATED,
                new ChatMessagePayload(
                        "message-" + sequence,
                        "room-1",
                        sequence,
                        "membership-" + senderUserId,
                        "client-" + sequence,
                        content,
                        MessageState.ACTIVE,
                        countable,
                        1,
                        NOW,
                        NOW,
                        null));
    }

    private ClaimedChatMessageOutboxEvent deletedClaimed(long sequence) {
        return deletedClaimed(sequence, true);
    }

    private ClaimedChatMessageOutboxEvent deletedClaimed(
            long sequence,
            boolean countable
    ) {
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
                        "membership-owner",
                        "client-" + sequence,
                        null,
                        MessageState.DELETED_BY_AUTHOR,
                        countable,
                        2L,
                        NOW,
                        NOW,
                        NOW),
                NOW);
    }

    private ChatMessageEventEnvelope deletedEnvelope(long sequence) {
        return deletedEnvelope(sequence, true);
    }

    private ChatMessageEventEnvelope deletedEnvelope(
            long sequence,
            boolean countable
    ) {
        return new ChatMessageEventEnvelope(
                ChatMessageEventEnvelope.CURRENT_VERSION,
                ChatMessageOutboxEvent.MESSAGE_DELETED,
                new ChatMessagePayload(
                        "message-" + sequence,
                        "room-1",
                        sequence,
                        "membership-owner",
                        "client-" + sequence,
                        null,
                        MessageState.DELETED_BY_AUTHOR,
                        countable,
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
        return membership(
                membershipId,
                userId,
                role,
                MembershipStatus.ACTIVE,
                0);
    }

    private Membership membership(
            String membershipId,
            String userId,
            MembershipRole role,
            MembershipStatus status,
            long boundary
    ) {
        return Membership.restore(
                membershipId,
                "room-1",
                userId,
                role,
                status,
                NOW.minusSeconds(60),
                status == MembershipStatus.LEFT ? NOW : null,
                status == MembershipStatus.BANNED ? NOW : null,
                boundary,
                1);
    }

    private Room room() {
        return room(RoomStatus.ACTIVE, 2);
    }

    private Room room(RoomStatus status, int activeMemberCount) {
        return Room.restore(
                "room-1",
                "Room",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner",
                status,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                activeMemberCount,
                NOW.minusSeconds(120),
                status == RoomStatus.CLOSED ? NOW : null,
                1);
    }
}
