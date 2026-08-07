package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import com.hamcheeze.chat.message.query.ChatMessageHistoryReader;
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
import com.hamcheeze.chat.room.application.command.UpdateRoomSettingsCommand;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.application.transaction.RoomOptimisticConflictException;
import com.hamcheeze.chat.room.inbox.RoomReadPosition;
import com.hamcheeze.chat.room.inbox.RoomReadPositionResolver;
import com.hamcheeze.chat.room.inbox.RoomReadState;
import com.hamcheeze.chat.room.inbox.RoomReadStateStore;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomCommandReceiptDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.room.mongo.MongoUserActiveRoomQuotaLockDocument;
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

import java.time.Instant;
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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest
@ActiveProfiles("local")
class RoomCommandServiceIntegrationTest
        extends MongoRuntimeIntegrationTest {

    @Autowired
    private RoomCommandService service;

    @Autowired
    private RoomStore roomStore;

    @Autowired
    private ChatMessageStore messageStore;

    @Autowired
    private ChatMessageHistoryReader messageHistoryReader;

    @Autowired
    private RoomMembershipProperties membershipProperties;

    @Autowired
    private RoomReadStateStore readStateStore;

    @Autowired
    private RoomReadPositionResolver readPositionResolver;

    @MockitoSpyBean
    private MembershipStore membershipStore;

    @MockitoSpyBean
    private ActiveRoomMembershipQuotaGuard membershipQuotaGuard;

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
                        "Different room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
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
        assertThat(count(
                MongoUserActiveRoomQuotaLockDocument.COLLECTION_NAME))
                .isZero();
    }

    @Test
    void createEnforcesUserActiveRoomLimitReplaysAndAllowsExemption() {
        seedActiveRooms("quota-user", 19, "owned-");
        RoomCommandExecution twentieth = service.createRoom(
                createCommand(
                        "quota-user",
                        requestId(),
                        JoinPolicy.OPEN));
        String rejectedRequestId = requestId();
        CreateRoomCommand rejectedCommand = createCommand(
                "quota-user",
                rejectedRequestId,
                JoinPolicy.OPEN);

        RoomCommandExecution rejected =
                service.createRoom(rejectedCommand);
        RoomCommandExecution replay = service.createRoom(
                rejectedCommand,
                ActiveRoomMembershipLimitMode.EXEMPT);
        RoomCommandExecution exempted = service.createRoom(
                createCommand(
                        "quota-user",
                        requestId(),
                        JoinPolicy.OPEN),
                ActiveRoomMembershipLimitMode.EXEMPT);

        assertThat(twentieth.result().code())
                .isEqualTo(RoomCommandResultCode.ROOM_CREATED);
        assertThat(rejected.result().code()).isEqualTo(
                RoomCommandResultCode
                        .USER_ACTIVE_ROOM_LIMIT_EXCEEDED);
        assertThat(rejected.replayed()).isFalse();
        assertThat(replay.result()).isEqualTo(rejected.result());
        assertThat(replay.replayed()).isTrue();
        assertThat(roomStore.findById(rejected.result().roomId()))
                .isEmpty();
        assertThat(exempted.result().code())
                .isEqualTo(RoomCommandResultCode.ROOM_CREATED);
        assertThat(activeMembershipCount("quota-user"))
                .isEqualTo(21);
        assertThat(quotaLock("quota-user").getLong("revision"))
                .isEqualTo(2L);
    }

    @Test
    void joinAndRejoinUseSlotsWhileAlreadyActiveDoesNotCheckAgain() {
        seedActiveRooms("quota-user", 19, "owned-");
        String firstTarget = createOpenRoom("owner-a");
        String secondTarget = createOpenRoom("owner-b");
        String thirdTarget = createOpenRoom("owner-c");

        assertThat(service.joinRoom(new JoinRoomCommand(
                "quota-user",
                requestId(),
                firstTarget)).result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        long revisionAtLimit = quotaLock("quota-user")
                .getLong("revision");

        assertThat(service.joinRoom(new JoinRoomCommand(
                "quota-user",
                requestId(),
                firstTarget)).result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_ACTIVE);
        assertThat(quotaLock("quota-user").getLong("revision"))
                .isEqualTo(revisionAtLimit);

        assertThat(service.joinRoom(new JoinRoomCommand(
                "quota-user",
                requestId(),
                secondTarget)).result().code())
                .isEqualTo(RoomCommandResultCode
                        .USER_ACTIVE_ROOM_LIMIT_EXCEEDED);
        assertThat(membershipStore.findByRoomIdAndUserId(
                secondTarget,
                "quota-user")).isEmpty();
        assertThat(mongoOperations.findById(
                secondTarget,
                MongoRoomSequenceDocument.class)).isNull();

        service.leaveRoom(new LeaveRoomCommand(
                "quota-user",
                requestId(),
                firstTarget));
        assertThat(service.joinRoom(new JoinRoomCommand(
                "quota-user",
                requestId(),
                secondTarget)).result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        service.leaveRoom(new LeaveRoomCommand(
                "quota-user",
                requestId(),
                secondTarget));
        assertThat(service.joinRoom(new JoinRoomCommand(
                "quota-user",
                requestId(),
                secondTarget)).result().code())
                .isEqualTo(RoomCommandResultCode.REJOINED);
        assertThat(service.banMember(new BanMemberCommand(
                "owner-b",
                requestId(),
                secondTarget,
                "quota-user")).result().code())
                .isEqualTo(RoomCommandResultCode.BANNED);
        assertThat(service.joinRoom(new JoinRoomCommand(
                "quota-user",
                requestId(),
                thirdTarget)).result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        assertThat(service.unbanMember(new UnbanMemberCommand(
                "owner-b",
                requestId(),
                secondTarget,
                "quota-user")).result().code())
                .isEqualTo(RoomCommandResultCode.UNBANNED);
        assertThat(membership(secondTarget, "quota-user").status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(activeMembershipCount("quota-user"))
                .isEqualTo(20);
    }

    @Test
    void overLimitUserKeepsExistingMembershipsAndCanReuseSlot() {
        seedActiveRooms("quota-user", 21, "over-limit-");
        String existingRoom = "over-limit-0";

        assertThat(service.joinRoom(new JoinRoomCommand(
                "quota-user",
                requestId(),
                existingRoom)).result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_ACTIVE);
        assertThat(service.createRoom(createCommand(
                "quota-user",
                requestId(),
                JoinPolicy.OPEN)).result().code())
                .isEqualTo(RoomCommandResultCode
                        .USER_ACTIVE_ROOM_LIMIT_EXCEEDED);

        service.closeRoom(new CloseRoomCommand(
                "quota-user",
                requestId(),
                existingRoom));
        assertThat(activeMembershipCount("quota-user"))
                .isEqualTo(20);
        assertThat(service.createRoom(createCommand(
                "quota-user",
                requestId(),
                JoinPolicy.OPEN)).result().code())
                .isEqualTo(RoomCommandResultCode
                        .USER_ACTIVE_ROOM_LIMIT_EXCEEDED);

        service.closeRoom(new CloseRoomCommand(
                "quota-user",
                requestId(),
                "over-limit-1"));
        assertThat(service.createRoom(createCommand(
                "quota-user",
                requestId(),
                JoinPolicy.OPEN)).result().code())
                .isEqualTo(RoomCommandResultCode.ROOM_CREATED);
        assertThat(activeMembershipCount("quota-user"))
                .isEqualTo(20);
    }

    @Test
    void roomMemberLimitWinsBeforeUserQuotaAndDoesNotTouchLock() {
        String roomId = createOpenRoom("owner-1");
        joinMembers(roomId, "member-", 1, 49);
        seedActiveRooms("quota-user", 20, "owned-");

        RoomCommandExecution execution = service.joinRoom(
                new JoinRoomCommand(
                        "quota-user",
                        requestId(),
                        roomId));

        assertThat(execution.result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_MEMBER_LIMIT_EXCEEDED);
        assertThat(quotaLock("quota-user")).isNull();
        assertThat(service.joinRoom(
                new JoinRoomCommand(
                        "exempt-user",
                        requestId(),
                        roomId),
                ActiveRoomMembershipLimitMode.EXEMPT)
                .result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_MEMBER_LIMIT_EXCEEDED);
    }

    @Test
    void concurrentJoinsAcrossRoomsSerializeLastUserSlot()
            throws Exception {
        seedActiveRooms("quota-user", 19, "owned-");
        String roomA = createOpenRoom("owner-a");
        String roomB = createOpenRoom("owner-b");

        List<RoomCommandExecution> executions = concurrently(
                () -> service.joinRoom(new JoinRoomCommand(
                        "quota-user", requestId(), roomA)),
                () -> service.joinRoom(new JoinRoomCommand(
                        "quota-user", requestId(), roomB)));

        assertThat(executions)
                .extracting(execution -> execution.result().code())
                .containsExactlyInAnyOrder(
                        RoomCommandResultCode.JOINED,
                        RoomCommandResultCode
                                .USER_ACTIVE_ROOM_LIMIT_EXCEEDED);
        assertThat(activeMembershipCount("quota-user"))
                .isEqualTo(20);
    }

    @Test
    void concurrentCreateAndJoinSerializeLastUserSlot()
            throws Exception {
        seedActiveRooms("quota-user", 19, "owned-");
        String targetRoom = createOpenRoom("owner-a");

        List<RoomCommandExecution> executions = concurrently(
                () -> service.createRoom(createCommand(
                        "quota-user",
                        requestId(),
                        JoinPolicy.OPEN)),
                () -> service.joinRoom(new JoinRoomCommand(
                        "quota-user",
                        requestId(),
                        targetRoom)));

        assertThat(executions)
                .extracting(execution -> execution.result().code())
                .contains(RoomCommandResultCode
                        .USER_ACTIVE_ROOM_LIMIT_EXCEEDED);
        assertThat(executions.stream()
                .filter(execution -> execution.result().code()
                        == RoomCommandResultCode.ROOM_CREATED
                        || execution.result().code()
                        == RoomCommandResultCode.JOINED))
                .hasSize(1);
        assertThat(activeMembershipCount("quota-user"))
                .isEqualTo(20);
    }

    @Test
    void concurrentCreatesSerializeLastUserSlot()
            throws Exception {
        seedActiveRooms("quota-user", 19, "owned-");

        List<RoomCommandExecution> executions = concurrently(
                () -> service.createRoom(createCommand(
                        "quota-user",
                        requestId(),
                        JoinPolicy.OPEN)),
                () -> service.createRoom(createCommand(
                        "quota-user",
                        requestId(),
                        JoinPolicy.OPEN)));

        assertThat(executions)
                .extracting(execution -> execution.result().code())
                .containsExactlyInAnyOrder(
                        RoomCommandResultCode.ROOM_CREATED,
                        RoomCommandResultCode
                                .USER_ACTIVE_ROOM_LIMIT_EXCEEDED);
        assertThat(activeMembershipCount("quota-user"))
                .isEqualTo(20);
    }

    @Test
    void quotaLockConflictExhaustionUsesConcurrencyFailureContract() {
        doThrow(new RoomOptimisticConflictException(
                "forced quota conflict"))
                .when(membershipQuotaGuard)
                .checkBeforeIncrease(
                        anyString(),
                        anyInt(),
                        any(Instant.class));

        assertThatThrownBy(() -> service.createRoom(createCommand(
                "quota-user",
                requestId(),
                JoinPolicy.OPEN)))
                .isInstanceOfSatisfying(
                        RoomCommandExecutionException.class,
                        exception -> assertThat(exception.kind())
                                .isEqualTo(RoomCommandFailureKind
                                        .CONCURRENCY_RETRY_EXHAUSTED));
        verify(membershipQuotaGuard, times(3))
                .checkBeforeIncrease(
                        anyString(),
                        anyInt(),
                        any(Instant.class));
        assertThat(count(MongoRoomDocument.COLLECTION_NAME)).isZero();
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isZero();
    }

    @Test
    void joinLeaveRejoinNoOpAndPastReplayStayConsistent() {
        String roomId = createOpenRoom("owner-1");
        appendMessages(roomId, "owner-1", 3);
        String joinRequest = requestId();
        JoinRoomCommand join = new JoinRoomCommand(
                "user-2",
                joinRequest,
                roomId);

        RoomCommandExecution joined = service.joinRoom(join);
        Membership afterJoin = membership(roomId, "user-2");
        long revisionAfterJoin = boundaryRevision(roomId);
        RoomCommandExecution alreadyActive = service.joinRoom(
                new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        roomId));
        Membership afterAlreadyActive = membership(roomId, "user-2");
        long revisionAfterAlreadyActive = boundaryRevision(roomId);
        RoomCommandExecution left = service.leaveRoom(
                new LeaveRoomCommand(
                        "user-2",
                        requestId(),
                        roomId));
        Membership beforeReplay = membership(roomId, "user-2");
        Room roomBeforeReplay = roomStore.findById(roomId).orElseThrow();
        appendMessages(roomId, "owner-1", 3);
        RoomCommandExecution replay = service.joinRoom(join);
        Membership afterReplay = membership(
                roomId,
                "user-2");
        long revisionAfterReplay = boundaryRevision(roomId);
        Room roomAfterReplay =
                roomStore.findById(roomId).orElseThrow();
        RoomCommandExecution rejoined = service.joinRoom(
                new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        roomId));

        assertThat(joined.result().code())
                .isEqualTo(RoomCommandResultCode.JOINED);
        assertThat(alreadyActive.result().code())
                .isEqualTo(RoomCommandResultCode.ALREADY_ACTIVE);
        assertThat(afterJoin.messageVisibleAfterSequence()).isEqualTo(3);
        assertThat(afterAlreadyActive.messageVisibleAfterSequence())
                .isEqualTo(3);
        assertThat(revisionAfterJoin).isEqualTo(1);
        assertThat(revisionAfterAlreadyActive)
                .isEqualTo(revisionAfterJoin);
        assertThat(left.result().code())
                .isEqualTo(RoomCommandResultCode.LEFT);
        assertThat(replay.result()).isEqualTo(joined.result());
        assertThat(replay.replayed()).isTrue();
        assertThat(afterReplay.status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(afterReplay).isEqualTo(beforeReplay);
        assertThat(roomAfterReplay).isEqualTo(roomBeforeReplay);
        assertThat(revisionAfterReplay)
                .isEqualTo(revisionAfterAlreadyActive);
        assertThat(rejoined.result().code())
                .isEqualTo(RoomCommandResultCode.REJOINED);
        assertThat(membership(roomId, "user-2")
                .messageVisibleAfterSequence()).isEqualTo(6);
        assertThat(boundaryRevision(roomId)).isEqualTo(2);
        assertRoomInvariants(roomId);
    }

    @Test
    void rejoinPreservesStoredCursorAndUsesNewVisibilityBoundary() {
        String roomId = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2", requestId(), roomId));
        Membership joined = membership(roomId, "user-2");
        appendMessages(roomId, "owner-1", 3);
        readStateStore.advance(
                joined.membershipId(),
                roomId,
                "user-2",
                2,
                Instant.parse("2026-08-07T01:00:00Z"));

        service.leaveRoom(new LeaveRoomCommand(
                "user-2", requestId(), roomId));
        appendMessages(roomId, "owner-1", 3);
        service.joinRoom(new JoinRoomCommand(
                "user-2", requestId(), roomId));

        Membership rejoined = membership(roomId, "user-2");
        RoomReadState stored = readStateStore.findByMembershipId(
                rejoined.membershipId()).orElseThrow();
        RoomReadPosition position = readPositionResolver.resolve(
                rejoined, stored);

        assertThat(rejoined.membershipId())
                .isEqualTo(joined.membershipId());
        assertThat(rejoined.version()).isGreaterThan(joined.version());
        assertThat(rejoined.messageVisibleAfterSequence()).isEqualTo(6);
        assertThat(stored.lastReadSequence()).isEqualTo(2);
        assertThat(position.storedLastReadSequence()).isEqualTo(2);
        assertThat(position.effectiveReadThroughSequence()).isEqualTo(6);
    }

    @Test
    void delayedReadStateWriteDoesNotRestoreLeftMembership() {
        String roomId = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2", requestId(), roomId));
        Membership active = membership(roomId, "user-2");
        appendMessages(roomId, "owner-1", 1);
        service.leaveRoom(new LeaveRoomCommand(
                "user-2", requestId(), roomId));
        Membership left = membership(roomId, "user-2");

        readStateStore.advance(
                active.membershipId(),
                roomId,
                "user-2",
                1,
                Instant.parse("2026-08-07T01:00:00Z"));

        Membership afterWrite = membership(roomId, "user-2");
        assertThat(afterWrite).isEqualTo(left);
        assertThat(afterWrite.status()).isEqualTo(MembershipStatus.LEFT);
        assertThat(readStateStore.findByMembershipId(
                active.membershipId()).orElseThrow().lastReadSequence())
                .isEqualTo(1);
    }

    @Test
    void delayedReadStateWriteDoesNotRestoreBannedMembership() {
        String roomId = createOpenRoom("owner-1");
        service.joinRoom(new JoinRoomCommand(
                "user-2", requestId(), roomId));
        Membership active = membership(roomId, "user-2");
        appendMessages(roomId, "owner-1", 1);
        service.banMember(new BanMemberCommand(
                "owner-1", requestId(), roomId, "user-2"));
        Membership banned = membership(roomId, "user-2");

        readStateStore.advance(
                active.membershipId(),
                roomId,
                "user-2",
                1,
                Instant.parse("2026-08-07T01:00:00Z"));

        Membership afterWrite = membership(roomId, "user-2");
        assertThat(afterWrite).isEqualTo(banned);
        assertThat(afterWrite.status()).isEqualTo(MembershipStatus.BANNED);
        assertThat(readStateStore.findByMembershipId(
                active.membershipId()).orElseThrow().lastReadSequence())
                .isEqualTo(1);
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
        assertThat(count(MongoRoomSequenceDocument.COLLECTION_NAME))
                .isZero();
        assertRoomInvariants(inviteRoom);
    }

    @Test
    void emptySequenceMessageAndJoinUpsertRaceRecoversAndSerializes()
            throws Exception {
        String roomId = createOpenRoom("owner-1");

        List<Object> results = concurrently(
                () -> messageStore.append(new NewChatMessage(
                        roomId,
                        "owner-1",
                        requestId(),
                        "first")),
                () -> service.joinRoom(new JoinRoomCommand(
                        "user-2",
                        requestId(),
                        roomId)));

        assertThat(results)
                .anyMatch(StoredChatMessage.class::isInstance)
                .anyMatch(result ->
                        result instanceof RoomCommandExecution execution
                                && execution.result().code()
                                == RoomCommandResultCode.JOINED);
        MongoRoomSequenceDocument sequence =
                mongoOperations.findById(
                        roomId,
                        MongoRoomSequenceDocument.class);
        assertThat(sequence).isNotNull();
        assertThat(sequence.lastSequence()).isEqualTo(1);
        assertThat(sequence.boundaryRevision()).isEqualTo(1);
        long boundary = membership(roomId, "user-2")
                .messageVisibleAfterSequence();
        assertThat(boundary).isIn(0L, 1L);
        assertThat(messageHistoryReader.findLatest(
                roomId, boundary, 10))
                .extracting(message -> message.roomSequence())
                .containsExactlyElementsOf(
                        boundary == 0L ? List.of(1L) : List.of());
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
    void defaultCapacityIncludesOwnerAndLimitRejectionReplays()
            throws Exception {
        assertThat(membershipProperties.maxActiveMembersPerRoom())
                .isEqualTo(50);
        String roomId = createOpenRoom("owner-1");
        joinMembers(roomId, "member-", 1, 49);
        Room fullRoom = roomStore.findById(roomId).orElseThrow();
        assertThat(fullRoom.activeMemberCount()).isEqualTo(50);
        assertThat(memberships(roomId)).hasSize(50);
        long boundaryRevisionBefore = boundaryRevision(roomId);

        String requestId = requestId();
        JoinRoomCommand command = new JoinRoomCommand(
                "member-50",
                requestId,
                roomId);
        long receiptsBefore = count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME);

        RoomCommandExecution rejected = service.joinRoom(command);
        RoomCommandExecution replay = service.joinRoom(command);

        assertThat(rejected.result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_MEMBER_LIMIT_EXCEEDED);
        assertThat(rejected.replayed()).isFalse();
        assertThat(replay.result()).isEqualTo(rejected.result());
        assertThat(replay.replayed()).isTrue();
        assertThat(roomStore.findById(roomId)).contains(fullRoom);
        assertThat(membershipStore.findByRoomIdAndUserId(
                roomId,
                "member-50")).isEmpty();
        assertThat(memberships(roomId)).hasSize(50);
        assertThat(boundaryRevision(roomId))
                .isEqualTo(boundaryRevisionBefore);
        assertThat(count(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME))
                .isEqualTo(receiptsBefore + 1);

        RoomCommandExecution alreadyActive = service.joinRoom(
                new JoinRoomCommand(
                        "member-1",
                        requestId(),
                        roomId));
        assertThat(alreadyActive.result().code()).isEqualTo(
                RoomCommandResultCode.ALREADY_ACTIVE);
        assertRoomInvariants(roomId);
    }

    @Test
    void leaveBanUnbanAndJoinPolicyPreserveCapacityPriority() {
        String roomId = createOpenRoom("owner-1");
        joinMembers(roomId, "member-", 1, 49);

        service.leaveRoom(new LeaveRoomCommand(
                "member-1",
                requestId(),
                roomId));
        assertThat(roomStore.findById(roomId).orElseThrow()
                .activeMemberCount()).isEqualTo(49);
        assertThat(service.joinRoom(new JoinRoomCommand(
                "member-50",
                requestId(),
                roomId)).result().code()).isEqualTo(
                RoomCommandResultCode.JOINED);
        assertThat(service.joinRoom(new JoinRoomCommand(
                "member-1",
                requestId(),
                roomId)).result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_MEMBER_LIMIT_EXCEEDED);

        service.banMember(new BanMemberCommand(
                "owner-1",
                requestId(),
                roomId,
                "member-2"));
        assertThat(roomStore.findById(roomId).orElseThrow()
                .activeMemberCount()).isEqualTo(49);
        assertThat(service.joinRoom(new JoinRoomCommand(
                "member-1",
                requestId(),
                roomId)).result().code()).isEqualTo(
                RoomCommandResultCode.REJOINED);
        assertThat(service.joinRoom(new JoinRoomCommand(
                "member-2",
                requestId(),
                roomId)).result().code()).isEqualTo(
                RoomCommandResultCode.MEMBERSHIP_BANNED);

        service.unbanMember(new UnbanMemberCommand(
                "owner-1",
                requestId(),
                roomId,
                "member-2"));
        assertThat(roomStore.findById(roomId).orElseThrow()
                .activeMemberCount()).isEqualTo(50);
        assertThat(membership(roomId, "member-2").status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(service.joinRoom(new JoinRoomCommand(
                "member-2",
                requestId(),
                roomId)).result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_MEMBER_LIMIT_EXCEEDED);

        service.updateRoomSettings(updateSettings(
                "owner-1",
                requestId(),
                roomId,
                false,
                null,
                false,
                null,
                false,
                null,
                true,
                JoinPolicy.INVITE_ONLY));
        assertThat(service.joinRoom(new JoinRoomCommand(
                "member-51",
                requestId(),
                roomId)).result().code()).isEqualTo(
                RoomCommandResultCode.JOIN_POLICY_NOT_OPEN);

        service.leaveRoom(new LeaveRoomCommand(
                "member-3",
                requestId(),
                roomId));
        service.updateRoomSettings(updateSettings(
                "owner-1",
                requestId(),
                roomId,
                false,
                null,
                false,
                null,
                false,
                null,
                true,
                JoinPolicy.OPEN));
        assertThat(service.joinRoom(new JoinRoomCommand(
                "member-2",
                requestId(),
                roomId)).result().code()).isEqualTo(
                RoomCommandResultCode.REJOINED);
        assertThat(roomStore.findById(roomId).orElseThrow()
                .activeMemberCount()).isEqualTo(50);
        assertRoomInvariants(roomId);
    }

    @Test
    void concurrentJoinsAtLastSlotNeverExceedCapacity()
            throws Exception {
        String roomId = createOpenRoom("owner-1");
        joinMembers(roomId, "member-", 1, 48);

        List<RoomCommandExecution> executions = concurrently(
                () -> service.joinRoom(new JoinRoomCommand(
                        "member-49",
                        requestId(),
                        roomId)),
                () -> service.joinRoom(new JoinRoomCommand(
                        "member-50",
                        requestId(),
                        roomId)));

        assertThat(executions)
                .extracting(execution -> execution.result().code())
                .containsExactlyInAnyOrder(
                        RoomCommandResultCode.JOINED,
                        RoomCommandResultCode
                                .ROOM_MEMBER_LIMIT_EXCEEDED);
        assertThat(roomStore.findById(roomId).orElseThrow()
                .activeMemberCount()).isEqualTo(50);
        assertThat(memberships(roomId)).hasSize(50);
        assertThat(List.of("member-49", "member-50").stream()
                .filter(userId -> membershipStore
                        .findByRoomIdAndUserId(roomId, userId)
                        .isPresent()))
                .hasSize(1);
        assertRoomInvariants(roomId);
    }

    @Test
    void concurrentRejoinsAtLastSlotNeverExceedCapacity()
            throws Exception {
        String roomId = createOpenRoom("owner-1");
        joinMembers(roomId, "member-", 1, 49);
        service.leaveRoom(new LeaveRoomCommand(
                "member-1",
                requestId(),
                roomId));
        service.leaveRoom(new LeaveRoomCommand(
                "member-2",
                requestId(),
                roomId));
        service.joinRoom(new JoinRoomCommand(
                "filler-member",
                requestId(),
                roomId));

        List<RoomCommandExecution> executions = concurrently(
                () -> service.joinRoom(new JoinRoomCommand(
                        "member-1",
                        requestId(),
                        roomId)),
                () -> service.joinRoom(new JoinRoomCommand(
                        "member-2",
                        requestId(),
                        roomId)));

        assertThat(executions)
                .extracting(execution -> execution.result().code())
                .containsExactlyInAnyOrder(
                        RoomCommandResultCode.REJOINED,
                        RoomCommandResultCode
                                .ROOM_MEMBER_LIMIT_EXCEEDED);
        assertThat(roomStore.findById(roomId).orElseThrow()
                .activeMemberCount()).isEqualTo(50);
        assertThat(List.of("member-1", "member-2").stream()
                .filter(userId -> membership(roomId, userId)
                        .status() == MembershipStatus.ACTIVE))
                .hasSize(1);
        assertRoomInvariants(roomId);
    }

    @Test
    void loweredLimitDoesNotBreakExistingRoomAndAllowsShrink() {
        String roomId = createOpenRoom("owner-1");
        joinMembers(roomId, "member-", 1, 4);
        membershipProperties.setMaxActiveMembersPerRoom(3);
        try {
            assertThat(roomStore.findById(roomId).orElseThrow()
                    .activeMemberCount()).isEqualTo(5);
            assertThat(service.joinRoom(new JoinRoomCommand(
                    "member-1",
                    requestId(),
                    roomId)).result().code()).isEqualTo(
                    RoomCommandResultCode.ALREADY_ACTIVE);
            assertThat(service.joinRoom(new JoinRoomCommand(
                    "new-member",
                    requestId(),
                    roomId)).result().code()).isEqualTo(
                    RoomCommandResultCode
                            .ROOM_MEMBER_LIMIT_EXCEEDED);

            service.leaveRoom(new LeaveRoomCommand(
                    "member-1",
                    requestId(),
                    roomId));
            service.banMember(new BanMemberCommand(
                    "owner-1",
                    requestId(),
                    roomId,
                    "member-2"));
            assertThat(roomStore.findById(roomId).orElseThrow()
                    .activeMemberCount()).isEqualTo(3);
            assertThat(service.joinRoom(new JoinRoomCommand(
                    "new-member",
                    requestId(),
                    roomId)).result().code()).isEqualTo(
                    RoomCommandResultCode
                            .ROOM_MEMBER_LIMIT_EXCEEDED);

            service.leaveRoom(new LeaveRoomCommand(
                    "member-3",
                    requestId(),
                    roomId));
            assertThat(service.joinRoom(new JoinRoomCommand(
                    "new-member",
                    requestId(),
                    roomId)).result().code()).isEqualTo(
                    RoomCommandResultCode.JOINED);
            assertThat(roomStore.findById(roomId).orElseThrow()
                    .activeMemberCount()).isEqualTo(3);
            assertRoomInvariants(roomId);
        } finally {
            membershipProperties.setMaxActiveMembersPerRoom(50);
        }
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

    @Test
    void updateSettingsCommitsNoOpReplaysAndEnforcesOwnerState() {
        RoomCommandExecution created = service.createRoom(
                new CreateRoomCommand(
                        "owner-1",
                        requestId(),
                        "Initial room",
                        "Initial description",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN));
        String roomId = created.result().roomId();
        String updateRequestId = requestId();
        UpdateRoomSettingsCommand update =
                updateSettings(
                        "owner-1",
                        updateRequestId,
                        roomId,
                        true,
                        "  Changed room  ",
                        true,
                        "  Changed description  ",
                        true,
                        RoomVisibility.UNLISTED,
                        true,
                        JoinPolicy.INVITE_ONLY);

        RoomCommandExecution updated =
                service.updateRoomSettings(update);
        RoomCommandExecution replay =
                service.updateRoomSettings(update);
        RoomCommandExecution unchanged =
                service.updateRoomSettings(updateSettings(
                        "owner-1",
                        requestId(),
                        roomId,
                        true,
                        "Changed room",
                        true,
                        "Changed description",
                        true,
                        RoomVisibility.UNLISTED,
                        true,
                        JoinPolicy.INVITE_ONLY));
        RoomCommandExecution forbidden =
                service.updateRoomSettings(updateSettings(
                        "member-2",
                        requestId(),
                        roomId,
                        true,
                        "Forbidden",
                        false,
                        null,
                        false,
                        null,
                        false,
                        null));

        assertThat(updated.result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_SETTINGS_UPDATED);
        assertThat(updated.result().roomVersion()).isEqualTo(1);
        assertThat(updated.result().roomSettings().name())
                .isEqualTo("Changed room");
        assertThat(updated.result().roomSettings().description())
                .isEqualTo("Changed description");
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.result()).isEqualTo(updated.result());
        assertThat(unchanged.result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_SETTINGS_UNCHANGED);
        assertThat(unchanged.result().roomVersion()).isEqualTo(1);
        assertThat(forbidden.result().code()).isEqualTo(
                RoomCommandResultCode.NOT_ROOM_OWNER);

        Room persisted = roomStore.findById(roomId).orElseThrow();
        assertThat(persisted.name()).isEqualTo("Changed room");
        assertThat(persisted.description())
                .isEqualTo("Changed description");
        assertThat(persisted.visibility())
                .isEqualTo(RoomVisibility.UNLISTED);
        assertThat(persisted.joinPolicy())
                .isEqualTo(JoinPolicy.INVITE_ONLY);
        assertThat(persisted.version()).isEqualTo(1);
        assertThat(mongoOperations.findById(
                roomId,
                MongoRoomDocument.class).schemaVersion())
                .isEqualTo(
                        MongoRoomDocument.CURRENT_SCHEMA_VERSION);

        service.closeRoom(new CloseRoomCommand(
                "owner-1",
                requestId(),
                roomId));
        RoomCommandExecution closed =
                service.updateRoomSettings(updateSettings(
                        "owner-1",
                        requestId(),
                        roomId,
                        true,
                        "Closed change",
                        false,
                        null,
                        false,
                        null,
                        false,
                        null));
        assertThat(closed.result().code())
                .isEqualTo(RoomCommandResultCode.ROOM_CLOSED);
    }

    @Test
    void legacyRoomWithoutRequiredCategoryIsRejectedFailClosed() {
        String roomId = "legacy-settings-room";
        mongoOperations.insert(new MongoRoomDocument(
                roomId,
                1,
                null,
                "owner-legacy",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                1,
                java.time.Instant.parse("2026-07-30T00:00:00Z"),
                null,
                4));
        membershipStore.insert(Membership.restore(
                "legacy-owner-membership",
                roomId,
                "owner-legacy",
                MembershipRole.OWNER,
                MembershipStatus.ACTIVE,
                java.time.Instant.parse("2026-07-30T00:00:00Z"),
                null,
                null,
                0,
                0));

        assertThatThrownBy(() ->
                service.updateRoomSettings(updateSettings(
                        "owner-legacy",
                        requestId(),
                        roomId,
                        false,
                        null,
                        false,
                        null,
                        true,
                        RoomVisibility.UNLISTED,
                        false,
                        null)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Unsupported schemaVersion");
        MongoRoomDocument stored = mongoOperations.findById(
                roomId,
                MongoRoomDocument.class);
        assertThat(stored.schemaVersion()).isEqualTo(1);
        assertThat(stored.version()).isEqualTo(4);
    }

    @Test
    void settingsIdempotencyUsesCanonicalPatchAndSnapshot()
            throws Exception {
        String roomId = createOpenRoom("owner-1");
        String sameKey = requestId();
        UpdateRoomSettingsCommand padded = updateSettings(
                "owner-1",
                sameKey,
                roomId,
                true,
                "  Canonical room  ",
                false,
                null,
                false,
                null,
                false,
                null);

        RoomCommandExecution first =
                service.updateRoomSettings(padded);
        RoomCommandExecution canonicalReplay =
                service.updateRoomSettings(updateSettings(
                        "owner-1",
                        sameKey,
                        roomId,
                        true,
                        "Canonical room",
                        false,
                        null,
                        false,
                        null,
                        false,
                        null));
        RoomCommandExecution conflict =
                service.updateRoomSettings(updateSettings(
                        "owner-1",
                        sameKey,
                        roomId,
                        false,
                        null,
                        true,
                        "",
                        false,
                        null,
                        false,
                        null));

        assertThat(first.result().code()).isEqualTo(
                RoomCommandResultCode.ROOM_SETTINGS_UPDATED);
        assertThat(canonicalReplay.replayed()).isTrue();
        assertThat(canonicalReplay.result()).isEqualTo(first.result());
        assertThat(conflict.result().code()).isEqualTo(
                RoomCommandResultCode.IDEMPOTENCY_CONFLICT);
        assertThat(roomStore.findById(roomId).orElseThrow().version())
                .isEqualTo(1);
    }

    @Test
    void concurrentPartialSettingsPatchesMergeOnLatestRoom()
            throws Exception {
        String roomId = createOpenRoom("owner-1");

        List<RoomCommandExecution> executions = concurrently(
                () -> service.updateRoomSettings(updateSettings(
                        "owner-1",
                        requestId(),
                        roomId,
                        true,
                        "Concurrent name",
                        false,
                        null,
                        false,
                        null,
                        false,
                        null)),
                () -> service.updateRoomSettings(updateSettings(
                        "owner-1",
                        requestId(),
                        roomId,
                        false,
                        null,
                        false,
                        null,
                        true,
                        RoomVisibility.UNLISTED,
                        false,
                        null)));

        assertThat(executions)
                .allSatisfy(execution -> assertThat(
                        execution.result().code()).isEqualTo(
                        RoomCommandResultCode.ROOM_SETTINGS_UPDATED));
        Room room = roomStore.findById(roomId).orElseThrow();
        assertThat(room.name()).isEqualTo("Concurrent name");
        assertThat(room.visibility())
                .isEqualTo(RoomVisibility.UNLISTED);
        assertThat(room.version()).isEqualTo(2);
    }

    @Test
    void concurrentSameSettingsPatchChangesVersionOnlyOnce()
            throws Exception {
        String roomId = createOpenRoom("owner-1");

        List<RoomCommandExecution> executions = concurrently(
                () -> service.updateRoomSettings(updateSettings(
                        "owner-1",
                        requestId(),
                        roomId,
                        true,
                        "Shared final name",
                        false,
                        null,
                        false,
                        null,
                        false,
                        null)),
                () -> service.updateRoomSettings(updateSettings(
                        "owner-1",
                        requestId(),
                        roomId,
                        true,
                        "Shared final name",
                        false,
                        null,
                        false,
                        null,
                        false,
                        null)));

        assertThat(executions)
                .extracting(execution -> execution.result().code())
                .containsExactlyInAnyOrder(
                        RoomCommandResultCode.ROOM_SETTINGS_UPDATED,
                        RoomCommandResultCode.ROOM_SETTINGS_UNCHANGED);
        Room room = roomStore.findById(roomId).orElseThrow();
        assertThat(room.name()).isEqualTo("Shared final name");
        assertThat(room.version()).isEqualTo(1);
    }

    private String createOpenRoom(String ownerUserId) {
        return createRoom(ownerUserId, JoinPolicy.OPEN);
    }

    private void seedActiveRooms(
            String userId,
            int count,
            String roomPrefix
    ) {
        for (int index = 0; index < count; index++) {
            seedActiveRoom(roomPrefix + index, userId);
        }
    }

    private long activeMembershipCount(String userId) {
        return count(Query.query(Criteria.where("userId")
                        .is(userId)
                        .and("status")
                        .is(MembershipStatus.ACTIVE)),
                MongoMembershipDocument.COLLECTION_NAME);
    }

    private org.bson.Document quotaLock(String userId) {
        return mongoOperations.getCollection(
                        MongoUserActiveRoomQuotaLockDocument
                                .COLLECTION_NAME)
                .find(new org.bson.Document("_id", userId))
                .first();
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
                "Test room",
                        java.util.List.of(
                                com.hamcheeze.chat.room.RoomCategory.POLICY),
                RoomVisibility.LISTED,
                joinPolicy);
    }

    private UpdateRoomSettingsCommand updateSettings(
            String requester,
            String requestId,
            String roomId,
            boolean namePresent,
            String name,
            boolean descriptionPresent,
            String description,
            boolean visibilityPresent,
            RoomVisibility visibility,
            boolean joinPolicyPresent,
            JoinPolicy joinPolicy
    ) {
        return new UpdateRoomSettingsCommand(
                requester,
                requestId,
                roomId,
                namePresent,
                name,
                descriptionPresent,
                description,
                visibilityPresent,
                visibility,
                joinPolicyPresent,
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

    private void appendMessages(
            String roomId,
            String senderUserId,
            int count
    ) {
        for (int index = 0; index < count; index++) {
            messageStore.append(new NewChatMessage(
                    roomId,
                    senderUserId,
                    requestId(),
                    "message " + index));
        }
    }

    private void joinMembers(
            String roomId,
            String userPrefix,
            int first,
            int count
    ) {
        for (int index = first; index < first + count; index++) {
            RoomCommandExecution execution = service.joinRoom(
                    new JoinRoomCommand(
                            userPrefix + index,
                            requestId(),
                            roomId));
            assertThat(execution.result().code())
                    .isEqualTo(RoomCommandResultCode.JOINED);
        }
    }

    private long boundaryRevision(String roomId) {
        return mongoOperations.findById(
                        roomId,
                        MongoRoomSequenceDocument.class)
                .boundaryRevision();
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
    private final <T> List<T> concurrently(
            Callable<T>... actions
    ) throws Exception {
        ExecutorService pool =
                Executors.newFixedThreadPool(actions.length);
        CountDownLatch ready = new CountDownLatch(actions.length);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<T>> futures =
                    new ArrayList<>();
            for (Callable<T> action : actions) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(10, TimeUnit.SECONDS))
                            .isTrue();
                    return action.call();
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<T> executions =
                    new ArrayList<>();
            for (Future<T> future : futures) {
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
