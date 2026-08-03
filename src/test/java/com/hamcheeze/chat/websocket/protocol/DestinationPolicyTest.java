package com.hamcheeze.chat.websocket.protocol;

import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class DestinationPolicyTest {

    private final DestinationPolicy policy =
            new DestinationPolicy(new ChatContentProperties());

    @ParameterizedTest
    @CsvSource(value = {
            "/app/rooms/room-1/messages,APP_ROOM_MESSAGES,room-1",
            "/app/rooms/room-1/messages/edit,APP_ROOM_MESSAGE_EDIT,room-1",
            "/app/rooms/room-1/messages/delete,APP_ROOM_MESSAGE_DELETE,room-1",
            "/app/rooms/room-1/subscriptions/sync,APP_ROOM_SUBSCRIPTION_SYNC,room-1",
            "/topic/rooms/room-1/messages,TOPIC_ROOM_MESSAGES,room-1",
            "/topic/rooms/room-1/room-events,TOPIC_ROOM_EVENTS,room-1",
            "/topic/rooms/room-1/read-receipts,TOPIC_READ_RECEIPTS_DISABLED,room-1",
            "/user/queue/command-results,USER_COMMAND_RESULTS,NULL",
            "/user/queue/system-events,USER_SYSTEM_EVENTS,NULL",
            "/user/queue/room-inbox-events,USER_ROOM_INBOX_EVENTS,NULL",
            "/topic/rooms/*/messages,INVALID,NULL",
            "/topic/rooms/한글/messages,INVALID,NULL",
            "/topic/rooms/room-1/unknown,INVALID,NULL"
    }, nullValues = "NULL")
    void classifiesDestinations(
            String destination,
            DestinationKind expectedKind,
            String expectedRoomId
    ) {
        DestinationDescriptor descriptor = policy.classify(destination);

        assertThat(descriptor.kind()).isEqualTo(expectedKind);
        assertThat(descriptor.roomId()).isEqualTo(expectedRoomId);
    }
}
