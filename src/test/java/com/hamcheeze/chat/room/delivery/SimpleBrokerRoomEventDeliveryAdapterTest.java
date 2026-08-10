package com.hamcheeze.chat.room.delivery;

import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryOutcome;
import com.hamcheeze.chat.room.event.RoomEventEnvelope;
import com.hamcheeze.chat.room.event.RoomEventType;
import com.hamcheeze.chat.room.event.RoomMemberChangedEventPayload;
import com.hamcheeze.chat.room.event.RoomMemberState;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.MessageHeaders;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SimpleBrokerRoomEventDeliveryAdapterTest {

    private SimpMessagingTemplate template;
    private ActiveConnectionRegistry activeConnections;
    private SimpleBrokerRoomEventDeliveryAdapter adapter;

    @BeforeEach
    void setUp() {
        template = mock(SimpMessagingTemplate.class);
        activeConnections = mock(ActiveConnectionRegistry.class);
        adapter = new SimpleBrokerRoomEventDeliveryAdapter(
                template,
                activeConnections,
                new SimpleMeterRegistry());
    }

    @Test
    void publishesSameEnvelopeToRoomTopic() {
        RoomEventEnvelope event = event();

        assertThat(adapter.publishToRoom(event))
                .isEqualTo(RoomEventDeliveryOutcome.ACCEPTED);

        verify(template).convertAndSend(
                "/topic/rooms/room-1/room-events",
                event);
    }

    @Test
    void mapsRoomTemplateFailureToFailed() {
        RoomEventEnvelope event = event();
        doThrow(new IllegalStateException("broker down"))
                .when(template)
                .convertAndSend(any(String.class), any(Object.class));

        assertThat(adapter.publishToRoom(event))
                .isEqualTo(RoomEventDeliveryOutcome.FAILED);
    }

    @Test
    void returnsNoActiveConnectionWithoutUserDelivery() {
        when(activeConnections.findConnectionIdByUser("user-1"))
                .thenReturn(Optional.empty());

        assertThat(adapter.publishToUser("user-1", event()))
                .isEqualTo(
                        RoomEventDeliveryOutcome.NO_ACTIVE_CONNECTION);
        verify(template, never()).convertAndSendToUser(
                any(),
                any(),
                any(),
                any(MessageHeaders.class));
    }

    @Test
    void publishesUserCopyWithCurrentSessionId() {
        RoomEventEnvelope event = event();
        when(activeConnections.findConnectionIdByUser("user-1"))
                .thenReturn(Optional.of("connection-1"));
        when(activeConnections.isActive("user-1", "connection-1"))
                .thenReturn(true);
        ArgumentCaptor<MessageHeaders> headers =
                ArgumentCaptor.forClass(MessageHeaders.class);

        assertThat(adapter.publishToUser("user-1", event))
                .isEqualTo(RoomEventDeliveryOutcome.ACCEPTED);

        verify(template).convertAndSendToUser(
                eq("user-1"),
                eq("/queue/system-events"),
                eq(event),
                headers.capture());
        assertThat(headers.getValue().get("simpSessionId"))
                .isEqualTo("connection-1");
    }

    @Test
    void replacementThatBecameInactiveIsNotDelivered() {
        when(activeConnections.findConnectionIdByUser("user-1"))
                .thenReturn(Optional.of("connection-1"));
        when(activeConnections.isActive("user-1", "connection-1"))
                .thenReturn(false);

        assertThat(adapter.publishToUser("user-1", event()))
                .isEqualTo(
                        RoomEventDeliveryOutcome.NO_ACTIVE_CONNECTION);
        verify(template, never()).convertAndSendToUser(
                any(),
                any(),
                any(),
                any(MessageHeaders.class));
    }

    @Test
    void mapsUserTemplateFailureToFailed() {
        when(activeConnections.findConnectionIdByUser("user-1"))
                .thenReturn(Optional.of("connection-1"));
        when(activeConnections.isActive("user-1", "connection-1"))
                .thenReturn(true);
        doThrow(new IllegalStateException("broker down"))
                .when(template)
                .convertAndSendToUser(
                        eq("user-1"),
                        eq("/queue/system-events"),
                        any(),
                        any(MessageHeaders.class));

        assertThat(adapter.publishToUser("user-1", event()))
                .isEqualTo(RoomEventDeliveryOutcome.FAILED);
    }

    private static RoomEventEnvelope event() {
        return new RoomEventEnvelope(
                RoomEventEnvelope.CURRENT_VERSION,
                "550e8400-e29b-41d4-a716-446655440000",
                RoomEventType.ROOM_MEMBER_JOINED,
                Instant.parse("2026-07-28T10:00:00Z"),
                new RoomMemberChangedEventPayload(
                        "room-1",
                        4,
                        RoomStatus.ACTIVE,
                        new RoomMemberState(
                                "membership-1",
                                MembershipRole.MEMBER,
                                MembershipStatus.ACTIVE,
                                0)));
    }
}
