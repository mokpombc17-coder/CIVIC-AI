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
        assertThat(descriptor.roomAccessRevoked()).isFalse();
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

    @Test
    void revokesOnlyRoomScopedSubscriptions() {
        SubscriptionDescriptor messages = new SubscriptionDescriptor(
                "sub-1", "user-1", "/topic/rooms/room-1/messages",
                DestinationKind.TOPIC_ROOM_MESSAGES, "room-1", 100L);

        SubscriptionDescriptor revoked = messages.revokeRoomAccess();

        assertThat(revoked.roomAccessRevoked()).isTrue();
        assertThat(revoked.revokeRoomAccess()).isSameAs(revoked);
        assertThatThrownBy(() -> new SubscriptionDescriptor(
                "sub-2",
                "user-1",
                "/user/queue/system-events",
                DestinationKind.USER_SYSTEM_EVENTS,
                null,
                null,
                true))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
