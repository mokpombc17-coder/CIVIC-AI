package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.TransferOwnershipCommand;
import com.hamcheeze.chat.room.application.command.UnbanMemberCommand;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandReceiptDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.support.MongoRuntimeIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;

@SpringBootTest
@ActiveProfiles("local")
class RoomCommandServiceIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private RoomCommandService service;

    @Autowired
    private RoomStore roomStore;

    @MockitoSpyBean
    private MembershipStore membershipStore;

    @Test
    void createRoomCommitsOwnerAndReceiptAndReplays() {
        String requestId = requestId();
        CreateRoomCommand command = createCommand(
                "owner-1",
                requestId,
                JoinPolicy.OPEN);

        RoomCommandExecution first = service.createRoom(command);
        RoomCommandExecution replay = service.createRoom(command);

        assertThat(first.result().code())
                .isEqualTo(RoomCommandResultCode.ROOM_CREATED);
        assertThat(first.replayed()).isFalse();
        assertThat(replay.result()).isEqualTo(first.result());
        assertThat(replay.replayed()).isTrue();
        assertThat(count(MongoRoomDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertThat(count(MongoMembershipDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertRoomInvariants(first.result().roomId());
    }

    @Test
    void sameRequestWithDifferentCreatePayloadConflicts() {
        String requestId = requestId();
        RoomCommandExecution first = service.createRoom(
                createCommand(
                        "owner-1",
                        requestId,
                        JoinPolicy.OPEN));

        RoomCommandExecution conflict = service.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        requestId,
                        RoomVisibility.UNLISTED,
                        JoinPolicy.INVITE_ONLY));

        assertThat(conflict.result().code())
                .isEqualTo(
                        RoomCommandResultCode.IDEMPOTENCY_CONFLICT);
        assertThat(count(MongoRoomDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertRoomInvariants(first.result().roomId());
    }

    @Test
    void sameClientRequestIdIsScopedByRequester() {
        String requestId = requestId();

        RoomCommandExecution first = service.createRoom(
                createCommand(
                        "owner-1",
                        requestId,
                        JoinPolicy.OPEN));
        RoomCommandExecution second = service.createRoom(
                createCommand(
                        "owner-2",
                        requestId,
                        JoinPolicy.OPEN));

        assertThat(first.result().code())
                .isEqualTo(RoomCommandResultCode.ROOM_CREATED);
        assertThat(second.result().code())
                .isEqualTo(RoomCommandResultCode.ROOM_CREATED);
        assertThat(second.result().roomId())
                .isNotEqualTo(first.result().roomId());
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(2);
    }

    @Test
    void createFailureRollsBackRoomOwnerAndReceipt() {
        doThrow(new IllegalStateException("forced owner insert failure"))
                .when(membershipStore)
                .insert(any(Membership.class));

        assertThatThrownBy(() -> service.createRoom(createCommand(
                "owner-1",
                requestId(),
                JoinPolicy.OPEN)))
                .isInstanceOf(IllegalStateException.class);

        assertThat(count(MongoRoomDocument.COLLECTION_NAME)).isZero();
        assertThat(count(MongoMembershipDocument.COLLECTION_NAME))
                .isZero();
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isZero();
    }

    @Test
    void joinLeaveRejoinNoOpAndPastReplayStayConsistent() {
        String roomId = createOpenRoom("owner-1");
        String joinRequest = requestId();
        JoinRoomCommand join = new JoinRoomCommand(
                "user-2",
                joinRequest,
                roomId);

        RoomCommandExecution joined = service.joinRoom(join);
        RoomCommandExecution alreadyActive = service.joinRoom(
                new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        roomId));
        RoomCommandExecution left = service.leaveRoom(
                new LeaveRoomCommand(
                        "user-2",
                        requestId(),
                        roomId));
        RoomCommandExecution replay = service.joinRoom(join);
        Membership afterReplay = membership(
                roomId,
                "user-2");
        RoomCommandExecution rejoined = service.joinRoom(
                new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        roomId));

        assertThat(joined.result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        assertThat(alreadyActive.result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_ACTIVE);
        assertThat(left.result().code())
                .isEqualTo(RoomCommandResultCode.LEFT);
        assertThat(replay.result()).isEqualTo(joined.result());
        assertThat(replay.replayed()).isTrue();
        assertThat(afterReplay.status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(rejoined.result().code())
                .isEqualTo(RoomCommandResultCode.REJOINED);
        assertRoomInvariants(roomId);
    }

    @Test
    void deterministicJoinAndOwnerLeaveRejectionsAreReceipted() {
        String inviteRoom = createRoom(
                "owner-1",
                JoinPolicy.INVITE_ONLY);
        RoomCommandExecution invitationRequired = service.joinRoom(
                new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        inviteRoom));
        RoomCommandExecution ownerLeave = service.leaveRoom(
                new LeaveRoomCommand(
                        "owner-1",
                        requestId(),
                        inviteRoom));

        assertThat(invitationRequired.result().code())
                .isEqualTo(
                        RoomCommandResultCode.JOIN_POLICY_NOT_OPEN);
        assertThat(ownerLeave.result().code())
                .isEqualTo(
                        RoomCommandResultCode.OWNER_CANNOT_LEAVE);
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(3);
        assertRoomInvariants(inviteRoom);
    }

    @Test
    void banUnbanAndNoOpsKeepCountAndVersionsConsistent() {
        String roomId = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));

        RoomCommandExecution banned = service.banMember(
                new BanMemberCommand(
                        "owner-1",
                        requestId(),
                        roomId,
                        "user-2"));
        RoomCommandExecution alreadyBanned = service.banMember(
                new BanMemberCommand(
                        "owner-1",
                        requestId(),
                        roomId,
                        "user-2"));
        RoomCommandExecution unbanned = service.unbanMember(
                new UnbanMemberCommand(
                        "owner-1",
                        requestId(),
                        roomId,
                        "user-2"));
        RoomCommandExecution alreadyUnbanned = service.unbanMember(
                new UnbanMemberCommand(
                        "owner-1",
                        requestId(),
                        roomId,
                        "user-2"));

        assertThat(banned.result().code())
                .isEqualTo(RoomCommandResultCode.BANNED);
        assertThat(alreadyBanned.result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_BANNED);
        assertThat(unbanned.result().code())
                .isEqualTo(RoomCommandResultCode.UNBANNED);
        assertThat(alreadyUnbanned.result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_UNBANNED);
        assertThat(membership(roomId, "user-2").status())
                .isEqualTo(MembershipStatus.LEFT);
        assertRoomInvariants(roomId);
    }

    @Test
    void transferOwnershipAndCloseAreAtomic() {
        String roomId = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));

        RoomCommandExecution transferred =
                service.transferOwnership(
                        new TransferOwnershipCommand(
                                "owner-1",
                                requestId(),
                                roomId,
                                "user-2"));
        service.leaveRoom(new LeaveRoomCommand(
                "owner-1",
                requestId(),
                roomId));
        RoomCommandExecution closed = service.closeRoom(
                new CloseRoomCommand(
                        "user-2",
                        requestId(),
                        roomId));
        RoomCommandExecution alreadyClosed = service.closeRoom(
                new CloseRoomCommand(
                        "user-2",
                        requestId(),
                        roomId));

        assertThat(transferred.result().code())
                .isEqualTo(
                        RoomCommandResultCode.OWNERSHIP_TRANSFERRED);
        assertThat(closed.result().code())
                .isEqualTo(RoomCommandResultCode.CLOSED);
        assertThat(alreadyClosed.result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_CLOSED);
        Room room = roomStore.findById(roomId).orElseThrow();
        assertThat(room.status()).isEqualTo(RoomStatus.CLOSED);
        assertThat(room.activeMemberCount()).isZero();
        assertThat(membership(roomId, "user-2").role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(membership(roomId, "user-2").status())
                .isEqualTo(MembershipStatus.LEFT);
        assertRoomInvariants(roomId);
    }

    @Test
    void transferPrioritizesRoomStateAndRequesterBeforeTargetLookup() {
        String activeRoom = roomWithActiveMember();
        String missingRequestId = requestId();
        assertRejectionReplay(
                activeRoom,
                RoomCommandResultCode.NOT_ROOM_OWNER,
                () -> service.transferOwnership(
                        new TransferOwnershipCommand(
                                "non-owner",
                                missingRequestId,
                                activeRoom,
                                "missing-user")));
        String existingRequestId = requestId();
        assertRejectionReplay(
                activeRoom,
                RoomCommandResultCode.NOT_ROOM_OWNER,
                () -> service.transferOwnership(
                        new TransferOwnershipCommand(
                                "non-owner",
                                existingRequestId,
                                activeRoom,
                                "user-2")));

        String closedRoom = closedRoomWithFormerMember();
        String closedMissingRequestId = requestId();
        assertRejectionReplay(
                closedRoom,
                RoomCommandResultCode.ROOM_CLOSED,
                () -> service.transferOwnership(
                        new TransferOwnershipCommand(
                                "owner-2",
                                closedMissingRequestId,
                                closedRoom,
                                "missing-user")));
        String closedExistingRequestId = requestId();
        assertRejectionReplay(
                closedRoom,
                RoomCommandResultCode.ROOM_CLOSED,
                () -> service.transferOwnership(
                        new TransferOwnershipCommand(
                                "owner-2",
                                closedExistingRequestId,
                                closedRoom,
                                "user-2")));
    }

    @Test
    void banPrioritizesRoomStateAndRequesterBeforeTargetLookup() {
        String activeRoom = roomWithActiveMember();
        String missingRequestId = requestId();
        assertRejectionReplay(
                activeRoom,
                RoomCommandResultCode.NOT_ROOM_OWNER,
                () -> service.banMember(new BanMemberCommand(
                        "non-owner",
                        missingRequestId,
                        activeRoom,
                        "missing-user")));
        String existingRequestId = requestId();
        assertRejectionReplay(
                activeRoom,
                RoomCommandResultCode.NOT_ROOM_OWNER,
                () -> service.banMember(new BanMemberCommand(
                        "non-owner",
                        existingRequestId,
                        activeRoom,
                        "user-2")));

        String closedRoom = closedRoomWithFormerMember();
        String closedMissingRequestId = requestId();
        assertRejectionReplay(
                closedRoom,
                RoomCommandResultCode.ROOM_CLOSED,
                () -> service.banMember(new BanMemberCommand(
                        "owner-2",
                        closedMissingRequestId,
                        closedRoom,
                        "missing-user")));
        String closedExistingRequestId = requestId();
        assertRejectionReplay(
                closedRoom,
                RoomCommandResultCode.ROOM_CLOSED,
                () -> service.banMember(new BanMemberCommand(
                        "owner-2",
                        closedExistingRequestId,
                        closedRoom,
                        "user-2")));
    }

    @Test
    void unbanPrioritizesRoomStateAndRequesterBeforeTargetLookup() {
        String activeRoom = roomWithActiveMember();
        String missingRequestId = requestId();
        assertRejectionReplay(
                activeRoom,
                RoomCommandResultCode.NOT_ROOM_OWNER,
                () -> service.unbanMember(new UnbanMemberCommand(
                        "non-owner",
                        missingRequestId,
                        activeRoom,
                        "missing-user")));
        String existingRequestId = requestId();
        assertRejectionReplay(
                activeRoom,
                RoomCommandResultCode.NOT_ROOM_OWNER,
                () -> service.unbanMember(new UnbanMemberCommand(
                        "non-owner",
                        existingRequestId,
                        activeRoom,
                        "user-2")));

        String closedRoom = closedRoomWithFormerMember();
        String closedMissingRequestId = requestId();
        assertRejectionReplay(
                closedRoom,
                RoomCommandResultCode.ROOM_CLOSED,
                () -> service.unbanMember(new UnbanMemberCommand(
                        "owner-2",
                        closedMissingRequestId,
                        closedRoom,
                        "missing-user")));
        String closedExistingRequestId = requestId();
        assertRejectionReplay(
                closedRoom,
                RoomCommandResultCode.ROOM_CLOSED,
                () -> service.unbanMember(new UnbanMemberCommand(
                        "owner-2",
                        closedExistingRequestId,
                        closedRoom,
                        "user-2")));
    }

    @Test
    void leavePrioritizesClosedRoomBeforeMissingMembership() {
        String roomId = createOpenRoom("owner-1");
        service.closeRoom(new CloseRoomCommand(
                "owner-1",
                requestId(),
                roomId));
        String leaveRequestId = requestId();

        assertRejectionReplay(
                roomId,
                RoomCommandResultCode.ROOM_CLOSED,
                () -> service.leaveRoom(new LeaveRoomCommand(
                        "missing-user",
                        leaveRequestId,
                        roomId)));
    }

    @Test
    void closeOwnerReplaceFailureRollsBackRoomAndReceipt() {
        String roomId = createOpenRoom("owner-1");
        doReturn(false).when(membershipStore)
                .replaceIfVersionMatches(
                        any(Membership.class),
                        anyLong());

        assertThatThrownBy(() -> service.closeRoom(
                new CloseRoomCommand(
                        "owner-1",
                        requestId(),
                        roomId)))
                .isInstanceOf(RoomCommandExecutionException.class);

        Room room = roomStore.findById(roomId).orElseThrow();
        assertThat(room.status()).isEqualTo(RoomStatus.ACTIVE);
        assertThat(room.activeMemberCount()).isEqualTo(1);
        assertThat(membership(roomId, "owner-1").status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(1);
    }

    @Test
    void sameKeyConcurrentJoinMutatesOnceAndReplaysWinner()
            throws Exception {
        String roomId = createOpenRoom("owner-1");
        String requestId = requestId();
        JoinRoomCommand command = new JoinRoomCommand(
                "user-2",
                requestId,
                roomId);

        List<RoomCommandExecution> executions = concurrently(
                () -> service.joinRoom(command),
                () -> service.joinRoom(command));

        assertThat(executions)
                .extracting(execution -> execution.result().code())
                .containsOnly(RoomCommandResultCode.JOINED);
        assertThat(executions)
                .extracting(RoomCommandExecution::replayed)
                .containsExactlyInAnyOrder(false, true);
        assertThat(count(
                Query.query(Criteria.where("requesterUserId")
                        .is("user-2")
                        .and("clientRequestId").is(requestId)),
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertRoomInvariants(roomId);
    }

    @Test
    void differentKeyConcurrentJoinCreatesOneMembership()
            throws Exception {
        String roomId = createOpenRoom("owner-1");

        List<RoomCommandExecution> executions = concurrently(
                () -> service.joinRoom(new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        roomId)),
                () -> service.joinRoom(new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        roomId)));

        assertThat(executions)
                .extracting(execution -> execution.result().code())
                .containsExactlyInAnyOrder(
                        RoomCommandResultCode.JOINED,
                        RoomCommandResultCode.ALREADY_ACTIVE);
        assertThat(count(Query.query(Criteria.where("roomId")
                        .is(roomId)
                        .and("userId").is("user-2")),
                MongoMembershipDocument.COLLECTION_NAME))
                .isEqualTo(1);
        assertRoomInvariants(roomId);
    }

    @Test
    void joinCloseAndLeaveRacesPreserveAggregateInvariants()
            throws Exception {
        String joinCloseRoom = createOpenRoom("owner-1");
        concurrently(
                () -> service.joinRoom(new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        joinCloseRoom)),
                () -> service.closeRoom(new CloseRoomCommand(
                        "owner-1",
                        requestId(),
                        joinCloseRoom)));
        assertRoomInvariants(joinCloseRoom);
        Room afterJoinClose =
                roomStore.findById(joinCloseRoom).orElseThrow();
        if (afterJoinClose.status() == RoomStatus.CLOSED) {
            assertThat(membershipStore.findByRoomIdAndUserId(
                    joinCloseRoom,
                    "user-2")).isEmpty();
        }

        String leaveRoom = createOpenRoom("owner-2");
        service.joinRoom(new JoinRoomCommand(
                "user-3",
                requestId(),
                leaveRoom));
        List<RoomCommandExecution> leaves = concurrently(
                () -> service.leaveRoom(new LeaveRoomCommand(
                        "user-3",
                        requestId(),
                        leaveRoom)),
                () -> service.leaveRoom(new LeaveRoomCommand(
                        "user-3",
                        requestId(),
                        leaveRoom)));
        assertThat(leaves)
                .extracting(execution -> execution.result().code())
                .containsExactlyInAnyOrder(
                        RoomCommandResultCode.LEFT,
                        RoomCommandResultCode.ALREADY_LEFT);
        assertRoomInvariants(leaveRoom);
    }

    @Test
    void transferAndModerationRacesKeepExactlyOneActiveOwner()
            throws Exception {
        String roomId = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));
        service.joinRoom(new JoinRoomCommand(
                "user-3",
                requestId(),
                roomId));

        concurrently(
                () -> service.transferOwnership(
                        new TransferOwnershipCommand(
                                "owner-1",
                                requestId(),
                                roomId,
                                "user-2")),
                () -> service.transferOwnership(
                        new TransferOwnershipCommand(
                                "owner-1",
                                requestId(),
                                roomId,
                                "user-3")));
        assertRoomInvariants(roomId);

        Room room = roomStore.findById(roomId).orElseThrow();
        String owner = room.ownerUserId();
        String target = owner.equals("user-2")
                ? "user-3"
                : "user-2";
        concurrently(
                () -> service.banMember(new BanMemberCommand(
                        owner,
                        requestId(),
                        roomId,
                        target)),
                () -> service.leaveRoom(new LeaveRoomCommand(
                        target,
                        requestId(),
                        roomId)));
        assertRoomInvariants(roomId);
    }

    @Test
    void leaveCloseAndRejoinCloseNeverLeaveActiveMemberInClosedRoom()
            throws Exception {
        String leaveCloseRoom = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                leaveCloseRoom));
        concurrently(
                () -> service.leaveRoom(new LeaveRoomCommand(
                        "user-2",
                        requestId(),
                        leaveCloseRoom)),
                () -> service.closeRoom(new CloseRoomCommand(
                        "owner-1",
                        requestId(),
                        leaveCloseRoom)));
        assertRoomInvariants(leaveCloseRoom);

        String rejoinCloseRoom = createOpenRoom("owner-3");
        service.joinRoom(new JoinRoomCommand(
                "user-4",
                requestId(),
                rejoinCloseRoom));
        service.leaveRoom(new LeaveRoomCommand(
                "user-4",
                requestId(),
                rejoinCloseRoom));
        concurrently(
                () -> service.joinRoom(new JoinRoomCommand(
                        "user-4",
                        requestId(),
                        rejoinCloseRoom)),
                () -> service.closeRoom(new CloseRoomCommand(
                        "owner-3",
                        requestId(),
                        rejoinCloseRoom)));
        assertRoomInvariants(rejoinCloseRoom);
        Room room = roomStore.findById(rejoinCloseRoom).orElseThrow();
        if (room.status() == RoomStatus.CLOSED) {
            assertThat(membership(rejoinCloseRoom, "user-4").status())
                    .isNotEqualTo(MembershipStatus.ACTIVE);
        }
    }

    @Test
    void transferAgainstTargetLeaveOrBanPreservesOwnerInvariant()
            throws Exception {
        String leaveRoom = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                leaveRoom));
        concurrently(
                () -> service.transferOwnership(
                        new TransferOwnershipCommand(
                                "owner-1",
                                requestId(),
                                leaveRoom,
                                "user-2")),
                () -> service.leaveRoom(new LeaveRoomCommand(
                        "user-2",
                        requestId(),
                        leaveRoom)));
        assertRoomInvariants(leaveRoom);

        String banRoom = createOpenRoom("owner-3");
        service.joinRoom(new JoinRoomCommand(
                "user-4",
                requestId(),
                banRoom));
        concurrently(
                () -> service.transferOwnership(
                        new TransferOwnershipCommand(
                                "owner-3",
                                requestId(),
                                banRoom,
                                "user-4")),
                () -> service.banMember(new BanMemberCommand(
                        "owner-3",
                        requestId(),
                        banRoom,
                        "user-4")));
        assertRoomInvariants(banRoom);
    }

    @Test
    void banAgainstRejoinKeepsCountAlignedWithFinalStatus()
            throws Exception {
        String roomId = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));
        service.leaveRoom(new LeaveRoomCommand(
                "user-2",
                requestId(),
                roomId));

        concurrently(
                () -> service.banMember(new BanMemberCommand(
                        "owner-1",
                        requestId(),
                        roomId,
                        "user-2")),
                () -> service.joinRoom(new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        roomId)));

        assertRoomInvariants(roomId);
    }

    private String createOpenRoom(String ownerUserId) {
        return createRoom(ownerUserId, JoinPolicy.OPEN);
    }

    private String roomWithActiveMember() {
        String roomId = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));
        return roomId;
    }

    private String closedRoomWithFormerMember() {
        String roomId = createOpenRoom("owner-2");
        service.joinRoom(new JoinRoomCommand(
                "user-2",
                requestId(),
                roomId));
        service.leaveRoom(new LeaveRoomCommand(
                "user-2",
                requestId(),
                roomId));
        service.closeRoom(new CloseRoomCommand(
                "owner-2",
                requestId(),
                roomId));
        return roomId;
    }

    private String createRoom(
            String ownerUserId,
            JoinPolicy joinPolicy
    ) {
        return service.createRoom(createCommand(
                        ownerUserId,
                        requestId(),
                        joinPolicy))
                .result()
                .roomId();
    }

    private CreateRoomCommand createCommand(
            String ownerUserId,
            String requestId,
            JoinPolicy joinPolicy
    ) {
        return new CreateRoomCommand(
                ownerUserId,
                requestId,
                RoomVisibility.LISTED,
                joinPolicy);
    }

    private Membership membership(
            String roomId,
            String userId
    ) {
        return membershipStore
                .findByRoomIdAndUserId(roomId, userId)
                .orElseThrow();
    }

    private void assertRejectionReplay(
            String roomId,
            RoomCommandResultCode expectedCode,
            Supplier<RoomCommandExecution> command
    ) {
        Room roomBefore = roomStore.findById(roomId).orElseThrow();
        List<Membership> membershipsBefore =
                memberships(roomId);
        long receiptsBefore = count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME);

        RoomCommandExecution first = command.get();
        RoomCommandExecution replay = command.get();

        assertThat(first.result().code()).isEqualTo(expectedCode);
        assertThat(first.replayed()).isFalse();
        assertThat(replay.result()).isEqualTo(first.result());
        assertThat(replay.replayed()).isTrue();
        assertThat(roomStore.findById(roomId)).contains(roomBefore);
        assertThat(memberships(roomId))
                .containsExactlyElementsOf(membershipsBefore);
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(receiptsBefore + 1);
        assertRoomInvariants(roomId);
    }

    private List<Membership> memberships(String roomId) {
        return mongoOperations.find(
                        Query.query(Criteria.where("roomId").is(roomId)),
                        MongoMembershipDocument.class)
                .stream()
                .map(MongoMembershipDocument::toDomain)
                .sorted(Comparator.comparing(
                        Membership::membershipId))
                .toList();
    }

    private void assertRoomInvariants(String roomId) {
        Room room = roomStore.findById(roomId).orElseThrow();
        List<Membership> memberships = memberships(roomId);
        List<Membership> owners = memberships.stream()
                .filter(membership ->
                        membership.role() == MembershipRole.OWNER)
                .toList();
        long activeCount = memberships.stream()
                .filter(membership ->
                        membership.status()
                                == MembershipStatus.ACTIVE)
                .count();

        assertThat(owners).hasSize(1);
        Membership owner = owners.getFirst();
        assertThat(owner.userId()).isEqualTo(room.ownerUserId());
        assertThat(activeCount).isEqualTo(room.activeMemberCount());
        if (room.status() == RoomStatus.ACTIVE) {
            assertThat(owner.status())
                    .isEqualTo(MembershipStatus.ACTIVE);
        } else {
            assertThat(owner.status())
                    .isEqualTo(MembershipStatus.LEFT);
        }
    }

    @SafeVarargs
    private final List<RoomCommandExecution> concurrently(
            Callable<RoomCommandExecution>... actions
    ) throws Exception {
        ExecutorService pool =
                Executors.newFixedThreadPool(actions.length);
        CountDownLatch ready = new CountDownLatch(actions.length);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<RoomCommandExecution>> futures =
                    new ArrayList<>();
            for (Callable<RoomCommandExecution> action : actions) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(10, TimeUnit.SECONDS))
                            .isTrue();
                    return action.call();
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<RoomCommandExecution> executions =
                    new ArrayList<>();
            for (Future<RoomCommandExecution> future : futures) {
                executions.add(future.get(20, TimeUnit.SECONDS));
            }
            return executions;
        } finally {
            pool.shutdownNow();
        }
    }

    private long count(String collection) {
        return count(new Query(), collection);
    }

    private long count(Query query, String collection) {
        return mongoOperations.count(query, collection);
    }

    private String requestId() {
        return UUID.randomUUID().toString();
    }
}
