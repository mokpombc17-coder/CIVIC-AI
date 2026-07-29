package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.config.SubscriptionLimitProperties;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InMemoryChatSubscriptionRegistryTest {

    private InMemoryChatSubscriptionRegistry registry;

    @BeforeEach
    void setUp() {
        SubscriptionLimitProperties properties =
                new SubscriptionLimitProperties();
        properties.setMaxActiveRoomsPerConnection(1);
        properties.setMaxSubscriptionsPerConnection(5);
        properties.setMaxSubscribersPerRoom(2);
        registry = new InMemoryChatSubscriptionRegistry(
                properties, new SimpleMeterRegistry());
    }

    @Test
    void countsTwoDestinationsInOneRoomAsOneRoomSubscriber() {
        assertThat(registry.register(
                "connection-1",
                descriptor("sub-1", "room-1", "messages")).registered())
                .isTrue();
        assertThat(registry.register(
                "connection-1",
                descriptor("sub-2", "room-1", "events")).registered())
                .isTrue();

        assertThat(registry.activeSubscriptionCount()).isEqualTo(2);
        assertThat(registry.activeRoomSubscriberCount()).isOne();
        assertThat(registry.hasRoomSubscription(
                "connection-1",
                "room-1")).isTrue();
        assertThat(registry.hasRoomSubscription(
                "connection-1",
                "user-1",
                "room-1",
                DestinationKind.TOPIC_ROOM_MESSAGES))
                .isTrue();
        assertThat(registry.hasRoomSubscription(
                "connection-1",
                "user-1",
                "room-1",
                DestinationKind.TOPIC_ROOM_EVENTS))
                .isTrue();
        assertThat(registry.hasRoomSubscription(
                "connection-1",
                "user-2",
                "room-1",
                DestinationKind.TOPIC_ROOM_MESSAGES))
                .isFalse();
        assertThat(registry.findConnectionIdsByRoom("room-1"))
                .containsExactly("connection-1");
        assertThat(registry.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).containsExactly("connection-1");
    }

    @Test
    void rejectsSecondActiveRoomAndDuplicateDestination() {
        SubscriptionDescriptor first =
                descriptor("sub-1", "room-1", "messages");
        registry.register("connection-1", first);

        assertThat(registry.register(
                "connection-1",
                descriptor("sub-2", "room-1", "messages")).rejectionCode())
                .isEqualTo(
                        SubscriptionRejectedCode.DUPLICATE_SUBSCRIPTION);
        assertThat(registry.register(
                "connection-1",
                descriptor("sub-3", "room-2", "messages")).rejectionCode())
                .isEqualTo(
                        SubscriptionRejectedCode.ACTIVE_ROOM_LIMIT_EXCEEDED);
    }

    @Test
    void rejectsThirdRoomSubscriberAndCleansUpIdempotently() {
        registry.register(
                "connection-1",
                descriptor("sub-1", "room-1", "messages"));
        registry.register(
                "connection-2",
                descriptor("sub-2", "room-1", "messages"));

        assertThat(registry.register(
                "connection-3",
                descriptor("sub-3", "room-1", "messages")).rejectionCode())
                .isEqualTo(
                        SubscriptionRejectedCode.ROOM_SUBSCRIBER_LIMIT_EXCEEDED);

        assertThat(registry.removeAll("connection-1")).isOne();
        assertThat(registry.removeAll("connection-1")).isZero();
        assertThat(registry.activeRoomSubscriberCount()).isOne();
    }

    @Test
    void rejectsTheFiftyFirstRoomSubscriber() {
        SubscriptionLimitProperties properties =
                new SubscriptionLimitProperties();
        properties.setMaxSubscribersPerRoom(50);
        InMemoryChatSubscriptionRegistry fiftyPersonRegistry =
                new InMemoryChatSubscriptionRegistry(
                        properties, new SimpleMeterRegistry());
        for (int index = 0; index < 50; index++) {
            assertThat(fiftyPersonRegistry.register(
                    "connection-" + index,
                    descriptor(
                            "sub-" + index,
                            "room-1",
                            "messages")).registered())
                    .isTrue();
        }

        assertThat(fiftyPersonRegistry.register(
                "connection-50",
                descriptor("sub-50", "room-1", "messages"))
                .rejectionCode())
                .isEqualTo(
                        SubscriptionRejectedCode.ROOM_SUBSCRIBER_LIMIT_EXCEEDED);
    }

    @Test
    void rejectsTheSixthSubscription() {
        for (int index = 0; index < 5; index++) {
            assertThat(registry.register(
                    "connection-1",
                    new SubscriptionDescriptor(
                            "sub-" + index,
                            "user-1",
                            "/user/queue/test-" + index,
                            DestinationKind.USER_SYSTEM_EVENTS,
                            null)).registered())
                    .isTrue();
        }

        assertThat(registry.register(
                "connection-1",
                new SubscriptionDescriptor(
                        "sub-5",
                        "user-1",
                        "/user/queue/test-5",
                        DestinationKind.USER_SYSTEM_EVENTS,
                        null)).rejectionCode())
                .isEqualTo(
                        SubscriptionRejectedCode.SUBSCRIPTION_LIMIT_EXCEEDED);
    }

    @Test
    void findsDistinctRoomConnectionsForUserAndExcludesPersonalSubscriptions() {
        registry.register(
                "connection-1",
                descriptor("sub-1", "user-1", "room-1", "messages"));
        registry.register(
                "connection-1",
                descriptor("sub-2", "user-1", "room-1", "events"));
        registry.register(
                "connection-2",
                descriptor("sub-3", "user-1", "room-1", "messages"));
        registry.register(
                "connection-3",
                descriptor("sub-4", "user-2", "room-1", "messages"));
        registry.register(
                "connection-4",
                new SubscriptionDescriptor(
                        "sub-5",
                        "user-1",
                        "/user/queue/command-results",
                        DestinationKind.USER_COMMAND_RESULTS,
                        null));

        assertThat(registry.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1"))
                .containsExactlyInAnyOrder("connection-1", "connection-2");

        registry.remove("connection-1", "sub-1");
        assertThat(registry.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).containsExactlyInAnyOrder(
                "connection-1",
                "connection-2");

        registry.remove("connection-1", "sub-2");
        registry.removeAll("connection-2");
        assertThat(registry.findConnectionIdsByUserAndRoom(
                "user-1",
                "room-1")).isEmpty();
    }

    @Test
    void rejectsSubscriptionsForDifferentUsersOnSameConnection() {
        registry.register(
                "connection-1",
                descriptor("sub-1", "user-1", "room-1", "messages"));

        assertThatThrownBy(() -> registry.register(
                "connection-1",
                descriptor("sub-2", "user-2", "room-1", "events")))
                .isInstanceOf(IllegalStateException.class);
    }

    private static SubscriptionDescriptor descriptor(
            String subscriptionId,
            String roomId,
            String suffix
    ) {
        return new SubscriptionDescriptor(
                subscriptionId,
                "user-1",
                "/topic/rooms/" + roomId + "/" + suffix,
                kind(suffix),
                roomId);
    }

    private static SubscriptionDescriptor descriptor(
            String subscriptionId,
            String userId,
            String roomId,
            String suffix
    ) {
        return new SubscriptionDescriptor(
                subscriptionId,
                userId,
                "/topic/rooms/" + roomId + "/" + suffix,
                kind(suffix),
                roomId);
    }

    private static DestinationKind kind(String suffix) {
        return "events".equals(suffix)
                ? DestinationKind.TOPIC_ROOM_EVENTS
                : DestinationKind.TOPIC_ROOM_MESSAGES;
    }
}
