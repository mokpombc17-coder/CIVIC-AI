package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxEvent;
import com.hamcheeze.chat.message.outbox.ClaimedChatMessageOutboxEvent;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RoomInboxNotificationUpdatePipelineTest {

    private static final Instant NOW =
            Instant.parse("2026-08-05T08:00:00Z");

    @Test
    void currentUpdateIsInvalidationOnlyForAuthorAndUncountableMessage() {
        RoomInboxCurrentSummaryReader summaryReader = current(
                "message-101", 101, 2, MessageState.ACTIVE);
        Membership author = membership("author", 0);
        Membership other = membership("other", 0);

        Result result = run(
                summaryReader,
                List.of(author, other),
                update("message-101", 101, 2,
                        "author", false));

        assertThat(result.events()).hasSize(2).allSatisfy(event -> {
            assertThat(event.eventVersion()).isEqualTo(1);
            assertThat(event.cause())
                    .isEqualTo(RoomInboxEvent.Cause.MESSAGE_UPDATED);
            assertThat(event.roomNameHint()).isNull();
            assertThat(event.coalescedCreateCount()).isNull();
            assertThat(event.notificationHint()).isNull();
            assertThat(event.sourceEventIds()).containsExactly(
                    ChatMessageOutboxEvent.messageUpdatedEventId(
                            "message-101", 2));
        });
        verify(summaryReader).findCurrent("room-1");
    }

    @Test
    void staleDeletedAndBoundaryUpdatesAreSuppressed() {
        assertThat(run(
                current("message-102", 102, 1, MessageState.ACTIVE),
                List.of(membership("member", 0)),
                update("message-101", 101, 2,
                        "author", true)).events()).isEmpty();
        assertThat(run(
                current("message-101", 101, 3, MessageState.ACTIVE),
                List.of(membership("member", 0)),
                update("message-101", 101, 2,
                        "author", true)).events()).isEmpty();
        assertThat(run(
                current("message-101", 101, 3,
                        MessageState.DELETED_BY_AUTHOR),
                List.of(membership("member", 0)),
                update("message-101", 101, 2,
                        "author", true)).events()).isEmpty();
        assertThat(run(
                current("message-101", 101, 2, MessageState.ACTIVE),
                List.of(membership("member", 101)),
                update("message-101", 101, 2,
                        "author", true)).events()).isEmpty();
        assertThat(run(
                current("message-101", 101, 2, MessageState.ACTIVE),
                List.of(membership("member", 102)),
                update("message-101", 101, 2,
                        "author", true)).events()).isEmpty();
    }

    @Test
    void coalescesToCurrentUpdateAndSuppressesItBehindCreateOrDelete() {
        Result versions = run(
                current("message-101", 101, 3, MessageState.ACTIVE),
                List.of(membership("member", 0)),
                update("message-101", 101, 2, "author", true),
                update("message-101", 101, 3, "author", true),
                update("message-101", 101, 3, "author", true));
        assertThat(versions.events()).singleElement().satisfies(event ->
                assertThat(event.sourceEventIds()).containsExactly(
                        ChatMessageOutboxEvent.messageUpdatedEventId(
                                "message-101", 3)));

        Result followedByCreate = run(
                current("message-102", 102, 1, MessageState.ACTIVE),
                List.of(membership("member", 0)),
                update("message-101", 101, 2, "author", true),
                create("message-102", 102, "author", true));
        assertThat(followedByCreate.events())
                .extracting(RoomInboxEvent::cause)
                .containsExactly(RoomInboxEvent.Cause.MESSAGE_CREATED);

        Result followedByDelete = run(
                current("message-101", 101, 3,
                        MessageState.DELETED_BY_AUTHOR),
                List.of(membership("member", 0)),
                update("message-101", 101, 2, "author", true),
                delete("message-101", 101, 3, "author", true));
        assertThat(followedByDelete.events())
                .extracting(RoomInboxEvent::cause)
                .containsExactly(RoomInboxEvent.Cause.MESSAGE_DELETED);
    }

    @Test
    void deleteInvalidationIncludesAuthorAndUncountableMessage() {
        RoomInboxCurrentSummaryReader summaryReader =
                mock(RoomInboxCurrentSummaryReader.class);
        Result result = run(
                summaryReader,
                List.of(membership("author", 0),
                        membership("other", 0)),
                delete("message-101", 101, 2,
                        "author", false));

        assertThat(result.events()).hasSize(2)
                .extracting(RoomInboxEvent::cause)
                .containsOnly(RoomInboxEvent.Cause.MESSAGE_DELETED);
        verifyNoInteractions(summaryReader);
        assertThat(run(
                summaryReader,
                List.of(membership("author", 101)),
                delete("message-101", 101, 2,
                        "author", false)).events()).isEmpty();
    }

    @Test
    void summaryFailuresConservativelyInvalidateAndIncrementMetric() {
        List<RoomInboxCurrentSummaryReader> failures = List.of(
                roomId -> Optional.empty(),
                roomId -> {
                    throw new RoomInboxCurrentSummaryReadException(
                            "unsupported-schema", null);
                },
                roomId -> {
                    throw new RoomInboxCurrentSummaryReadException(
                            "malformed-summary", null);
                },
                roomId -> {
                    throw new IllegalStateException("runtime");
                });

        for (RoomInboxCurrentSummaryReader failure : failures) {
            Result result = run(
                    failure,
                    List.of(membership("member", 0)),
                    update("message-101", 101, 2,
                            "author", true));
            assertThat(result.events()).singleElement().satisfies(event -> {
                assertThat(event.cause())
                        .isEqualTo(RoomInboxEvent.Cause.MESSAGE_UPDATED);
                assertThat(event.notificationHint()).isNull();
            });
            assertThat(result.meterRegistry().counter(
                    "room.inbox.notification.summary_resolution.failure")
                    .count()).isEqualTo(1);
        }
    }

    @Test
    void summaryIsReadOncePerUpdateRoomAndNeverWithoutUpdate() {
        RoomInboxCurrentSummaryReader summaryReader = current(
                "message-101", 101, 3, MessageState.ACTIVE);
        run(summaryReader,
                List.of(membership("member", 0)),
                update("message-101", 101, 2, "author", true),
                update("message-101", 101, 3, "author", true));
        verify(summaryReader, times(1)).findCurrent("room-1");

        RoomInboxCurrentSummaryReader withoutUpdate =
                mock(RoomInboxCurrentSummaryReader.class);
        run(withoutUpdate,
                List.of(membership("member", 0)),
                create("message-101", 101, "author", true),
                delete("message-102", 102, 2, "author", true));
        verify(withoutUpdate, never()).findCurrent("room-1");
    }

    @Test
    void separateUpdateRoomsResolveTheirSummaryOnceEach() {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        Membership first = membership("room-1", "member-1", 0);
        Membership second = membership("room-2", "member-2", 0);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room("room-1", 1)));
        when(roomReader.findRoomById("room-2"))
                .thenReturn(Optional.of(room("room-2", 1)));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(List.of(first), false));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-2", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(List.of(second), false));
        RoomInboxCurrentSummaryReader summaryReader =
                mock(RoomInboxCurrentSummaryReader.class);
        when(summaryReader.findCurrent("room-1")).thenReturn(Optional.of(
                new RoomInboxCurrentLastMessage(
                        "message-1", 1, 2, MessageState.ACTIVE)));
        when(summaryReader.findCurrent("room-2")).thenReturn(Optional.of(
                new RoomInboxCurrentLastMessage(
                        "message-2", 1, 2, MessageState.ACTIVE)));
        ActiveConnectionRegistry connections =
                mock(ActiveConnectionRegistry.class);
        for (Membership membership : List.of(first, second)) {
            String connection = "connection-" + membership.userId();
            when(connections.findConnectionIdByUser(membership.userId()))
                    .thenReturn(Optional.of(connection));
            when(connections.isActive(
                    membership.userId(), connection)).thenReturn(true);
        }
        RoomInboxNotificationPipeline pipeline = pipeline(
                roomReader,
                summaryReader,
                connections,
                (userId, connectionId, event) -> {
                },
                properties(),
                new SimpleMeterRegistry());

        pipeline.start();
        try {
            for (EventPair event : List.of(
                    updateInRoom("room-1", "message-1"),
                    updateInRoom("room-2", "message-2"))) {
                pipeline.onPublished(event.claimed(), event.envelope());
            }
        } finally {
            pipeline.stop();
        }

        verify(summaryReader, times(1)).findCurrent("room-1");
        verify(summaryReader, times(1)).findCurrent("room-2");
    }

    @Test
    void conservativeUpdatesKeepSourceOrderAndUseSharedChunkLimit() {
        RoomInboxProperties properties = properties();
        properties.getNotification().setMaxEventsPerRoomBatch(2);

        Result result = run(
                roomId -> Optional.empty(),
                List.of(membership("member", 0)),
                properties,
                update("message-1", 1, 2, "author", true),
                update("message-2", 2, 2, "author", true),
                update("message-3", 3, 2, "author", true),
                update("message-4", 4, 2, "author", true),
                update("message-5", 5, 2, "author", true));

        assertThat(result.events()).hasSize(3)
                .allSatisfy(event -> assertThat(event.cause())
                        .isEqualTo(RoomInboxEvent.Cause.MESSAGE_UPDATED));
        assertThat(result.events())
                .extracting(event -> event.sourceEventIds().size())
                .containsExactly(2, 2, 1);
        assertThat(result.events().stream()
                .flatMap(event -> event.sourceEventIds().stream()))
                .containsExactly(
                        ChatMessageOutboxEvent.messageUpdatedEventId(
                                "message-1", 2),
                        ChatMessageOutboxEvent.messageUpdatedEventId(
                                "message-2", 2),
                        ChatMessageOutboxEvent.messageUpdatedEventId(
                                "message-3", 2),
                        ChatMessageOutboxEvent.messageUpdatedEventId(
                                "message-4", 2),
                        ChatMessageOutboxEvent.messageUpdatedEventId(
                                "message-5", 2));
    }

    @Test
    void fullQueueDropsUpdateWithoutAffectingObserverCaller() {
        RoomInboxProperties properties = properties();
        properties.getNotification().setQueueCapacity(1);
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        RoomInboxNotificationPipeline pipeline = pipeline(
                mock(RoomQueryReader.class),
                mock(RoomInboxCurrentSummaryReader.class),
                mock(ActiveConnectionRegistry.class),
                (userId, connectionId, event) -> {
                },
                properties,
                meters);
        EventPair update = update(
                "message-101", 101, 2, "author", true);

        assertThatCode(() -> {
            pipeline.onPublished(update.claimed(), update.envelope());
            pipeline.onPublished(update.claimed(), update.envelope());
        }).doesNotThrowAnyException();
        assertThat(meters.counter(
                "room.inbox.notification.enqueue.dropped").count())
                .isEqualTo(1);
    }

    private Result run(
            RoomInboxCurrentSummaryReader summaryReader,
            List<Membership> memberships,
            EventPair... events
    ) {
        return run(
                summaryReader,
                memberships,
                properties(),
                events);
    }

    private Result run(
            RoomInboxCurrentSummaryReader summaryReader,
            List<Membership> memberships,
            RoomInboxProperties properties,
            EventPair... events
    ) {
        RoomQueryReader roomReader = mock(RoomQueryReader.class);
        when(roomReader.findRoomById("room-1"))
                .thenReturn(Optional.of(room(memberships.size())));
        when(roomReader.findMembershipsByRoomAndStatus(
                "room-1", MembershipStatus.ACTIVE, null, 100))
                .thenReturn(new CursorSlice<>(memberships, false));
        ActiveConnectionRegistry connections =
                mock(ActiveConnectionRegistry.class);
        for (Membership membership : memberships) {
            String connectionId = "connection-" + membership.userId();
            when(connections.findConnectionIdByUser(membership.userId()))
                    .thenReturn(Optional.of(connectionId));
            when(connections.isActive(
                    membership.userId(), connectionId)).thenReturn(true);
        }
        List<RoomInboxEvent> delivered =
                Collections.synchronizedList(new ArrayList<>());
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        RoomInboxNotificationPipeline pipeline = pipeline(
                roomReader,
                summaryReader,
                connections,
                (userId, connectionId, event) -> delivered.add(event),
                properties,
                meters);

        pipeline.start();
        try {
            for (EventPair event : events) {
                pipeline.onPublished(event.claimed(), event.envelope());
            }
        } finally {
            pipeline.stop();
        }
        return new Result(List.copyOf(delivered), meters);
    }

    private static RoomInboxNotificationPipeline pipeline(
            RoomQueryReader roomReader,
            RoomInboxCurrentSummaryReader summaryReader,
            ActiveConnectionRegistry connections,
            RoomInboxEventDelivery delivery,
            RoomInboxProperties properties,
            SimpleMeterRegistry meters
    ) {
        return new RoomInboxNotificationPipeline(
                roomReader,
                summaryReader,
                connections,
                delivery,
                properties,
                new ObjectMapper(),
                new ChatContentProperties(),
                Clock.fixed(NOW, ZoneOffset.UTC),
                meters);
    }

    private static RoomInboxCurrentSummaryReader current(
            String messageId,
            long sequence,
            long version,
            MessageState state
    ) {
        RoomInboxCurrentSummaryReader reader =
                mock(RoomInboxCurrentSummaryReader.class);
        when(reader.findCurrent("room-1")).thenReturn(Optional.of(
                new RoomInboxCurrentLastMessage(
                        messageId, sequence, version, state)));
        return reader;
    }

    private static RoomInboxProperties properties() {
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification().setCoalescingWindowMs(10);
        return properties;
    }

    private static Membership membership(String userId, long boundary) {
        return membership("room-1", userId, boundary);
    }

    private static Membership membership(
            String roomId,
            String userId,
            long boundary
    ) {
        return Membership.restore(
                "membership-" + userId,
                roomId,
                userId,
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                NOW.minusSeconds(60),
                null,
                null,
                boundary,
                1);
    }

    private static Room room(int activeMemberCount) {
        return room("room-1", activeMemberCount);
    }

    private static Room room(String roomId, int activeMemberCount) {
        return Room.restore(
                roomId,
                "Room",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "membership-owner",
                "owner",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                activeMemberCount,
                NOW.minusSeconds(120),
                null,
                1);
    }

    private static EventPair updateInRoom(
            String roomId,
            String messageId
    ) {
        return event(
                roomId,
                ChatMessageOutboxEvent.MESSAGE_UPDATED,
                ChatMessageOutboxEvent.messageUpdatedEventId(
                        messageId, 2),
                messageId,
                1,
                2,
                "author",
                true,
                MessageState.ACTIVE,
                "updated");
    }

    private static EventPair create(
            String messageId,
            long sequence,
            String sender,
            boolean countable
    ) {
        return event(
                "room-1",
                ChatMessageOutboxEvent.MESSAGE_CREATED,
                ChatMessageOutboxEvent.messageCreatedEventId(messageId),
                messageId,
                sequence,
                1,
                sender,
                countable,
                MessageState.ACTIVE,
                "created");
    }

    private static EventPair update(
            String messageId,
            long sequence,
            long version,
            String sender,
            boolean countable
    ) {
        return event(
                "room-1",
                ChatMessageOutboxEvent.MESSAGE_UPDATED,
                ChatMessageOutboxEvent.messageUpdatedEventId(
                        messageId, version),
                messageId,
                sequence,
                version,
                sender,
                countable,
                MessageState.ACTIVE,
                "updated");
    }

    private static EventPair delete(
            String messageId,
            long sequence,
            long version,
            String sender,
            boolean countable
    ) {
        return event(
                "room-1",
                ChatMessageOutboxEvent.MESSAGE_DELETED,
                ChatMessageOutboxEvent.messageDeletedEventId(
                        messageId, version),
                messageId,
                sequence,
                version,
                sender,
                countable,
                MessageState.DELETED_BY_AUTHOR,
                null);
    }

    private static EventPair event(
            String roomId,
            String eventType,
            String eventId,
            String messageId,
            long sequence,
            long version,
            String sender,
            boolean countable,
            MessageState state,
            String content
    ) {
        Instant deletedAt = state == MessageState.DELETED_BY_AUTHOR
                ? NOW : null;
        ClaimedChatMessageOutboxEvent claimed =
                new ClaimedChatMessageOutboxEvent(
                        eventId,
                        1,
                        ChatMessageOutboxEvent.CURRENT_SCHEMA_VERSION,
                        ChatMessageOutboxEvent.AGGREGATE_TYPE,
                        messageId,
                        ChatMessageOutboxEvent.CURRENT_EVENT_VERSION,
                        eventType,
                        roomId,
                        sequence,
                        new ClaimedChatMessageOutboxEvent.Payload(
                                messageId,
                                roomId,
                                sequence,
                                sender,
                                "client-" + messageId,
                                content,
                                state,
                                countable,
                                version,
                                NOW,
                                NOW,
                                deletedAt),
                        NOW);
        ChatMessageEventEnvelope envelope =
                new ChatMessageEventEnvelope(
                        ChatMessageOutboxEvent.CURRENT_EVENT_VERSION,
                        eventType,
                        new ChatMessagePayload(
                                messageId,
                                roomId,
                                sequence,
                                sender,
                                "client-" + messageId,
                                content,
                                state,
                                countable,
                                version,
                                NOW,
                                NOW,
                                deletedAt));
        return new EventPair(claimed, envelope);
    }

    private record EventPair(
            ClaimedChatMessageOutboxEvent claimed,
            ChatMessageEventEnvelope envelope
    ) {
    }

    private record Result(
            List<RoomInboxEvent> events,
            SimpleMeterRegistry meterRegistry
    ) {
    }
}
