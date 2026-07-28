package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationPort;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationReason;
import com.hamcheeze.chat.room.application.access.RoomAccessRevocationSummary;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;

@SpringBootTest
@ActiveProfiles("local")
class RoomCommandRevocationIntegrationTest
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
    private RoomAccessRevocationPort revocationPort;

    @Test
    void leaveCommitsBeforeRevocationAndSameKeyRetriesOnlyRevocation() {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        String requestId = uuid();
        LeaveRoomCommand command =
                new LeaveRoomCommand("user-2", requestId, roomId);
        failThenSucceedUser(
                "user-2",
                roomId,
                RoomAccessRevocationReason.MEMBERSHIP_LEFT);

        assertThatThrownBy(() -> commandService.leaveRoom(command))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> assertThat(exception.kind())
                                .isEqualTo(RoomCommandFailureKind
                                        .ACCESS_REVOCATION_FAILED));

        var committed = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow();
        long roomVersion = rooms.findById(roomId)
                .orElseThrow().version();
        assertThat(committed.status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(receipts.findByRequest("user-2", requestId))
                .isPresent();

        RoomCommandExecution replay =
                commandService.leaveRoom(command);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version())
                .isEqualTo(committed.version());
    }

    @Test
    void banFailureReplaysReceiptAndRetriesRevocation() {
        String roomId = createRoom("owner-1");
        join(roomId, "user-2");
        String requestId = uuid();
        BanMemberCommand command = new BanMemberCommand(
                "owner-1",
                requestId,
                roomId,
                "user-2");
        failThenSucceedUser(
                "user-2",
                roomId,
                RoomAccessRevocationReason.MEMBERSHIP_BANNED);

        assertRevocationFailure(() -> commandService.banMember(command));
        long roomVersion =
                rooms.findById(roomId).orElseThrow().version();
        long membershipVersion = memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version();
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().status())
                .isEqualTo(MembershipStatus.BANNED);

        RoomCommandExecution replay = commandService.banMember(command);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
        assertThat(memberships
                .findByRoomIdAndUserId(roomId, "user-2")
                .orElseThrow().version())
                .isEqualTo(membershipVersion);
    }

    @Test
    void closeFailureReplaysReceiptAndRetriesRoomRevocation() {
        String roomId = createRoom("owner-1");
        String requestId = uuid();
        CloseRoomCommand command =
                new CloseRoomCommand("owner-1", requestId, roomId);
        doReturn(
                new RoomAccessRevocationSummary(1, 0, 0, 1),
                RoomAccessRevocationSummary.noOp())
                .when(revocationPort)
                .revokeRoomAccess(
                        roomId,
                        RoomAccessRevocationReason.ROOM_CLOSED);

        assertRevocationFailure(() -> commandService.closeRoom(command));
        long roomVersion =
                rooms.findById(roomId).orElseThrow().version();
        assertThat(rooms.findById(roomId).orElseThrow().status())
                .isEqualTo(RoomStatus.CLOSED);

        RoomCommandExecution replay = commandService.closeRoom(command);

        assertThat(replay.replayed()).isTrue();
        assertThat(rooms.findById(roomId).orElseThrow().version())
                .isEqualTo(roomVersion);
    }

    private String createRoom(String ownerUserId) {
        return commandService.createRoom(new CreateRoomCommand(
                        ownerUserId,
                        uuid(),
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

    private void failThenSucceedUser(
            String userId,
            String roomId,
            RoomAccessRevocationReason reason
    ) {
        doReturn(
                new RoomAccessRevocationSummary(1, 0, 0, 1),
                RoomAccessRevocationSummary.noOp())
                .when(revocationPort)
                .revokeUserRoomAccess(userId, roomId, reason);
    }

    private static void assertRevocationFailure(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable command
    ) {
        assertThatThrownBy(command)
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> assertThat(exception.kind())
                                .isEqualTo(RoomCommandFailureKind
                                        .ACCESS_REVOCATION_FAILED));
    }

    private static String uuid() {
        return UUID.randomUUID().toString();
    }
}
