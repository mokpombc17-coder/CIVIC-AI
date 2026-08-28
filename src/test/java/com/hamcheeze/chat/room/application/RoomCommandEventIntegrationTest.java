package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationPort;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationReason;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.UpdateRoomSettingsCommand;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryOutcome;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryPort;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.event.RoomEventEnvelope;
import com.hamcheeze.chat.room.event.RoomEventType;
import com.hamcheeze.chat.room.event.RoomSettingsUpdatedEventPayload;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest
@ActiveProfiles("local")
class RoomCommandEventIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @jakarta.annotation.Resource
    private RoomCommandService commandService;

    @jakarta.annotation.Resource
    private RoomStore rooms;

    @jakarta.annotation.Resource
    private MembershipStore memberships;

    @jakarta.annotation.Resource
    private RoomCommandReceiptStore receipts;

    @MockitoSpyBean
    private RoomEventDeliveryPort eventDeliveryPort;

    @MockitoSpyBean
    private RoomAccessRevocationPort revocationPort;

    @BeforeEach
    void acceptRecordedDeliveries() {
        doReturn(RoomEventDeliveryOutcome.ACCEPTED)
                .when(eventDeliveryPort)
                .publishToRoom(any());
        doReturn(RoomEventDeliveryOutcome.ACCEPTED)
                .when(eventDeliveryPort)
                .publishToUser(any(), any());
    }

    @Test
    void createAndJoinPublishAfterCommittedStateAndReceiptExist() {
        String ownerRequestId = uuid();
        doAnswer(invocation -> {
            RoomEventEnvelope event = invocation.getArgument(0);
            assertThat(event.eventType())
                    .isEqualTo(RoomEventType.ROOM_CREATED);
            assertThat(rooms.findById(event.payload().roomId()))
                    .isPresent();
            assertThat(memberships.findByRoomIdAndUserId(
                    event.payload().roomId(),
                    "owner-1")).isPresent();
            assertThat(receipts.findByRequest(
                    "owner-1",
                    ownerRequestId)).isPresent();
            return RoomEventDeliveryOutcome.ACCEPTED;
        }).when(eventDeliveryPort).publishToRoom(any());

        RoomCommandExecution created = commandService.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        ownerRequestId,
                        "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN));

        String roomId = created.result().roomId();
        clearInvocations(eventDeliveryPort);
        String joinRequestId = uuid();
        doAnswer(invocation -> {
            RoomEventEnvelope event = invocation.getArgument(0);
            assertThat(event.eventType())
                    .isEqualTo(RoomEventType.ROOM_MEMBER_JOINED);
            assertThat(memberships.findByRoomIdAndUserId(
                    roomId,
                    "user-2").orElseThrow().status())
                    .isEqualTo(MembershipStatus.ACTIVE);
            assertThat(receipts.findByRequest(
                    "user-2",
                    joinRequestId)).isPresent();
            return RoomEventDeliveryOutcome.ACCEPTED;
        }).when(eventDeliveryPort).publishToRoom(any());
        JoinRoomCommand join =
                new JoinRoomCommand("user-2", joinRequestId, roomId);

        RoomCommandExecution joined = commandService.joinRoom(join);

        assertThat(joined.result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        ArgumentCaptor<RoomEventEnvelope> roomEvent =
                ArgumentCaptor.forClass(RoomEventEnvelope.class);
        ArgumentCaptor<RoomEventEnvelope> userEvent =
                ArgumentCaptor.forClass(RoomEventEnvelope.class);
        verify(eventDeliveryPort).publishToRoom(roomEvent.capture());
        verify(eventDeliveryPort).publishToUser(
                org.mockito.ArgumentMatchers.eq("user-2"),
                userEvent.capture());
        assertThat(userEvent.getValue())
                .isSameAs(roomEvent.getValue());
        assertThat(userEvent.getValue().eventId())
                .isEqualTo(roomEvent.getValue().eventId());
    }

    @Test
    void replayAndNewKeyBusinessNoOpDoNotPublishAgain() {
        String roomId = createRoom("owner-1");
        String requestId = uuid();
        JoinRoomCommand join =
                new JoinRoomCommand("user-2", requestId, roomId);
        clearInvocations(eventDeliveryPort);

        assertThat(commandService.joinRoom(join).result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        RoomCommandExecution replay = commandService.joinRoom(join);
        RoomCommandExecution noOp = commandService.joinRoom(
                new JoinRoomCommand("user-2", uuid(), roomId));

        assertThat(replay.replayed()).isTrue();
        assertThat(noOp.result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_ACTIVE);
        verify(eventDeliveryPort, times(1)).publishToRoom(any());
        verify(eventDeliveryPort, times(1))
                .publishToUser(eq("user-2"), any());
    }

    @Test
    void deliveryFailureDoesNotChangeCommittedJoinResult() {
        String roomId = createRoom("owner-1");
        clearInvocations(eventDeliveryPort);
        doReturn(RoomEventDeliveryOutcome.FAILED)
                .when(eventDeliveryPort)
                .publishToRoom(any());
        doReturn(RoomEventDeliveryOutcome.FAILED)
                .when(eventDeliveryPort)
                .publishToUser(any(), any());
        String requestId = uuid();

        RoomCommandExecution execution = commandService.joinRoom(
                new JoinRoomCommand("user-2", requestId, roomId));

        assertThat(execution.result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        assertThat(memberships.findByRoomIdAndUserId(
                roomId,
                "user-2").orElseThrow().status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(receipts.findByRequest("user-2", requestId))
                .isPresent();
        verify(eventDeliveryPort).publishToRoom(any());
        verify(eventDeliveryPort)
                .publishToUser(eq("user-2"), any());
        verify(revocationPort, never())
                .revokeUserRoomAccess(any(), any(), any());
    }

    @Test
    void settingsUpdatePublishesSnapshotButReplayAndNoOpDoNot() {
        String roomId = createRoom("owner-1");
        String requestId = uuid();
        UpdateRoomSettingsCommand update =
                new UpdateRoomSettingsCommand(
                        "owner-1",
                        requestId,
                        roomId,
                        true,
                        "Updated room",
                        true,
                        "Updated description",
                        true,
                        RoomVisibility.UNLISTED,
                        true,
                        JoinPolicy.INVITE_ONLY);
        clearInvocations(eventDeliveryPort, revocationPort);

        RoomCommandExecution first =
                commandService.updateRoomSettings(update);
        RoomCommandExecution replay =
                commandService.updateRoomSettings(update);
        RoomCommandExecution noOp =
                commandService.updateRoomSettings(
                        new UpdateRoomSettingsCommand(
                                "owner-1",
                                uuid(),
                                roomId,
                                true,
                                "Updated room",
                                true,
                                "Updated description",
                                true,
                                RoomVisibility.UNLISTED,
                                true,
                                JoinPolicy.INVITE_ONLY));

        assertThat(first.result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_SETTINGS_UPDATED);
        assertThat(replay.replayed()).isTrue();
        assertThat(noOp.result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_SETTINGS_UNCHANGED);
        ArgumentCaptor<RoomEventEnvelope> roomEvent =
                ArgumentCaptor.forClass(RoomEventEnvelope.class);
        verify(eventDeliveryPort, times(1))
                .publishToRoom(roomEvent.capture());
        verify(eventDeliveryPort, times(1))
                .publishToUser(eq("owner-1"), any());
        assertThat(roomEvent.getValue().eventType())
                .isEqualTo(RoomEventType.ROOM_SETTINGS_UPDATED);
        RoomSettingsUpdatedEventPayload payload =
                (RoomSettingsUpdatedEventPayload)
                        roomEvent.getValue().payload();
        assertThat(payload.roomVersion()).isEqualTo(1);
        assertThat(payload.name()).isEqualTo("Updated room");
        assertThat(payload.description())
                .isEqualTo("Updated description");
        assertThat(payload.categories())
                .containsExactly(
                        com.hamcheeze.chat.room.RoomCategory.POLICY);
        verify(revocationPort, never())
                .revokeUserRoomAccess(any(), any(), any());
    }

    @Test
    void leavePublishesAfterCommitAndBeforeAccessRevocation() {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        clearInvocations(eventDeliveryPort, revocationPort);
        String requestId = uuid();

        doAnswer(invocation -> {
            RoomEventEnvelope event = invocation.getArgument(0);
            assertThat(event.eventType())
                    .isEqualTo(RoomEventType.ROOM_MEMBER_LEFT);
            assertThat(memberships.findByRoomIdAndUserId(
                    roomId,
                    "user-2").orElseThrow().status())
                    .isEqualTo(MembershipStatus.LEFT);
            assertThat(receipts.findByRequest(
                    "user-2",
                    requestId)).isPresent();
            return RoomEventDeliveryOutcome.ACCEPTED;
        }).when(eventDeliveryPort).publishToRoom(any());

        RoomCommandExecution execution = commandService.leaveRoom(
                new LeaveRoomCommand("user-2", requestId, roomId));

        assertThat(execution.result().code())
                .isEqualTo(RoomCommandResultCode.LEFT);
        InOrder order = inOrder(eventDeliveryPort, revocationPort);
        order.verify(eventDeliveryPort).publishToRoom(any());
        order.verify(eventDeliveryPort)
                .publishToUser(eq("user-2"), any());
        order.verify(revocationPort).revokeUserRoomAccess(
                "user-2",
                roomId,
                RoomAccessRevocationReason.MEMBERSHIP_LEFT);
    }

    private String createRoom(String ownerUserId) {
        return commandService.createRoom(new CreateRoomCommand(
                        ownerUserId,
                        uuid(),
                        "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN))
                .result()
                .roomId();
    }

    private void join(String roomId, String userId) {
        commandService.joinRoom(new JoinRoomCommand(
                userId,
                uuid(),
                roomId));
    }

    private static String uuid() {
        return UUID.randomUUID().toString();
    }
}
