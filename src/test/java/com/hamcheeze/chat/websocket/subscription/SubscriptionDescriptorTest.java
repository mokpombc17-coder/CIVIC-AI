package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SubscriptionDescriptorTest {

    @Test
    void preservesAuthenticatedUserIdentity() {
        SubscriptionDescriptor descriptor =
                new SubscriptionDescriptor(
                        "sub-1",
                        "user-1",
                        "/topic/rooms/room-1/messages",
                        DestinationKind.TOPIC_ROOM_MESSAGES,
                        "room-1",
                        100L);

        assertThat(descriptor.userId()).isEqualTo("user-1");
        assertThat(descriptor.messageVisibleAfterSequence())
                .isEqualTo(100);
    }

    @Test
    void rejectsInvalidUserIdentity() {
        assertThatThrownBy(() -> new SubscriptionDescriptor(
                "sub-1",
                " ",
                "/topic/rooms/room-1/messages",
                DestinationKind.TOPIC_ROOM_MESSAGES,
                "room-1",
                0L))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void messagesRequireNonNegativeBoundaryAndOtherKindsRejectIt() {
        assertThatThrownBy(() -> new SubscriptionDescriptor(
                "sub-1", "user-1", "/topic/rooms/room-1/messages",
                DestinationKind.TOPIC_ROOM_MESSAGES, "room-1", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SubscriptionDescriptor(
                "sub-1", "user-1", "/topic/rooms/room-1/messages",
                DestinationKind.TOPIC_ROOM_MESSAGES, "room-1", -1L))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SubscriptionDescriptor(
                "sub-1", "user-1", "/topic/rooms/room-1/room-events",
                DestinationKind.TOPIC_ROOM_EVENTS, "room-1", 0L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
