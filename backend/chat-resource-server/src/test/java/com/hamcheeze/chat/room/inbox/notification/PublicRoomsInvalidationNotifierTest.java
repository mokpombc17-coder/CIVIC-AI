package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PublicRoomsInvalidationNotifierTest {

    private static final Instant NOW =
            Instant.parse("2026-10-27T01:10:00Z");

    @Test
    void serializesPayloadFreeVersionedEvent() throws Exception {
        PublicRoomsInvalidatedEvent event =
                PublicRoomsInvalidatedEvent.create(
                        "550e8400-e29b-41d4-a716-446655440000",
                        NOW);

        String json = JsonMapper.builder()
                .build()
                .writeValueAsString(event);

        assertThat(json).isEqualTo(
                "{\"eventVersion\":1,"
                        + "\"eventId\":\"550e8400-e29b-41d4-a716-446655440000\","
                        + "\"eventType\":\"PUBLIC_ROOMS_INVALIDATED\","
                        + "\"emittedAt\":\"2026-10-27T01:10:00Z\"}");
    }

    @Test
    void rejectsNonCanonicalEvent() {
        assertThatThrownBy(() -> PublicRoomsInvalidatedEvent.create(
                "550E8400-E29B-41D4-A716-446655440000", NOW))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PublicRoomsInvalidatedEvent(
                2,
                "550e8400-e29b-41d4-a716-446655440000",
                PublicRoomsInvalidatedEvent.EVENT_TYPE,
                NOW))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PublicRoomsInvalidatedEvent.create(
                "550e8400-e29b-41d4-a716-446655440000", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void broadcastsOneEventToEveryActiveConnection() {
        ActiveConnectionRegistry connections = connections(Map.of(
                "user-1", "connection-1",
                "user-2", "connection-2"));
        RecordingDelivery delivery = new RecordingDelivery(null);
        PublicRoomsInvalidationNotifier notifier =
                notifier(connections, delivery, 1);

        notifier.broadcast();

        assertThat(delivery.deliveries)
                .extracting(Delivery::userId, Delivery::connectionId)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple(
                                "user-1", "connection-1"),
                        org.assertj.core.groups.Tuple.tuple(
                                "user-2", "connection-2"));
        assertThat(delivery.deliveries)
                .extracting(Delivery::event)
                .allSatisfy(event -> {
                    assertThat(event.eventType())
                            .isEqualTo("PUBLIC_ROOMS_INVALIDATED");
                    assertThat(event.emittedAt()).isEqualTo(NOW);
                })
                .extracting(PublicRoomsInvalidatedEvent::eventId)
                .containsOnly(delivery.deliveries.getFirst()
                        .event().eventId());
    }

    @Test
    void continuesAfterIndividualDeliveryFailure() {
        ActiveConnectionRegistry connections = connections(Map.of(
                "user-1", "connection-1",
                "user-2", "connection-2"));
        RecordingDelivery delivery = new RecordingDelivery("user-1");
        PublicRoomsInvalidationNotifier notifier =
                notifier(connections, delivery, 1);

        notifier.broadcast();

        assertThat(delivery.deliveries)
                .extracting(Delivery::userId)
                .containsExactly("user-2");
    }

    @Test
    void coalescesRequestsWithinOneWindow() throws Exception {
        ActiveConnectionRegistry connections = connections(Map.of(
                "user-1", "connection-1"));
        CountDownLatch delivered = new CountDownLatch(1);
        RecordingDelivery delivery = new RecordingDelivery(null) {
            @Override
            public void deliver(
                    String userId,
                    String connectionId,
                    PublicRoomsInvalidatedEvent event
            ) {
                super.deliver(userId, connectionId, event);
                delivered.countDown();
            }
        };
        PublicRoomsInvalidationNotifier notifier =
                notifier(connections, delivery, 200);
        notifier.start();
        try {
            notifier.requestInvalidation();
            notifier.requestInvalidation();
            notifier.requestInvalidation();

            assertThat(delivered.await(5, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(400);
            assertThat(delivery.deliveries).hasSize(1);

            notifier.requestInvalidation();
            Thread.sleep(600);
            assertThat(delivery.deliveries).hasSize(2);
        } finally {
            notifier.stop();
        }
        assertThat(notifier.isRunning()).isFalse();
    }

    private static PublicRoomsInvalidationNotifier notifier(
            ActiveConnectionRegistry connections,
            PublicRoomsInvalidatedEventDelivery delivery,
            long windowMs
    ) {
        RoomInboxProperties properties = new RoomInboxProperties();
        properties.getNotification()
                .setPublicRoomsCoalescingWindowMs(windowMs);
        return new PublicRoomsInvalidationNotifier(
                connections,
                delivery,
                properties,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new SimpleMeterRegistry());
    }

    private static ActiveConnectionRegistry connections(
            Map<String, String> connectionIdsByUser
    ) {
        ActiveConnectionRegistry registry =
                mock(ActiveConnectionRegistry.class);
        when(registry.connectionIdsByUser())
                .thenReturn(connectionIdsByUser);
        return registry;
    }

    private record Delivery(
            String userId,
            String connectionId,
            PublicRoomsInvalidatedEvent event
    ) {
    }

    private static class RecordingDelivery
            implements PublicRoomsInvalidatedEventDelivery {

        final List<Delivery> deliveries = new CopyOnWriteArrayList<>();
        private final String failingUserId;

        RecordingDelivery(String failingUserId) {
            this.failingUserId = failingUserId;
        }

        @Override
        public void deliver(
                String userId,
                String connectionId,
                PublicRoomsInvalidatedEvent event
        ) {
            if (userId.equals(failingUserId)) {
                throw new IllegalStateException("delivery failed");
            }
            deliveries.add(new Delivery(userId, connectionId, event));
        }
    }
}
