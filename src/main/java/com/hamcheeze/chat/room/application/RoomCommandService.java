package com.hamcheeze.chat.room.application;

import com.hamcheeze.chat.room.BanMemberTransition;
import com.hamcheeze.chat.room.CloseRoomTransition;
import com.hamcheeze.chat.room.JoinRoomTransition;
import com.hamcheeze.chat.room.LeaveRoomTransition;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipRole;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.OwnershipTransferTransition;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomCreationResult;
import com.hamcheeze.chat.room.RoomDomainErrorCode;
import com.hamcheeze.chat.room.RoomDomainException;
import com.hamcheeze.chat.room.RoomMembershipTransitions;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.UnbanMemberTransition;
import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.RoomCommand;
import com.hamcheeze.chat.room.application.command.TransferOwnershipCommand;
import com.hamcheeze.chat.room.application.command.UnbanMemberCommand;
import com.hamcheeze.chat.room.application.access.RoomCommandAccessRevocationCoordinator;
import com.hamcheeze.chat.room.application.event.RoomCommandEventPropagationCoordinator;
import com.hamcheeze.chat.room.application.idempotency.IdempotentRoomCommandExecutor;
import com.hamcheeze.chat.room.application.idempotency.PreparedRoomCommand;
import com.hamcheeze.chat.room.application.idempotency.RoomCommandFingerprintFactory;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import com.hamcheeze.chat.room.application.transaction.RoomCommandExecutionException;
import com.hamcheeze.chat.room.application.transaction.RoomCommandFailureKind;
import com.hamcheeze.chat.room.application.transaction.RoomOptimisticConflictException;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandType;
import com.hamcheeze.chat.room.persistence.RoomStore;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.function.Supplier;

public final class RoomCommandService {

    private final RoomStore roomStore;
    private final MembershipStore membershipStore;
    private final IdempotentRoomCommandExecutor executor;
    private final RoomCommandFingerprintFactory fingerprintFactory;
    private final RoomCommandIdGenerator idGenerator;
    private final Clock clock;
    private final RoomCommandProperties properties;
    private final RoomCommandPostCommitCoordinator
            postCommitCoordinator;

    public RoomCommandService(
            RoomStore roomStore,
            MembershipStore membershipStore,
            IdempotentRoomCommandExecutor executor,
            RoomCommandFingerprintFactory fingerprintFactory,
            RoomCommandIdGenerator idGenerator,
            Clock clock,
            RoomCommandProperties properties
    ) {
        this(
                roomStore,
                membershipStore,
                executor,
                fingerprintFactory,
                idGenerator,
                clock,
                properties,
                RoomCommandPostCommitCoordinator.disabled());
    }

    public RoomCommandService(
            RoomStore roomStore,
            MembershipStore membershipStore,
            IdempotentRoomCommandExecutor executor,
            RoomCommandFingerprintFactory fingerprintFactory,
            RoomCommandIdGenerator idGenerator,
            Clock clock,
            RoomCommandProperties properties,
            RoomCommandAccessRevocationCoordinator
                    accessRevocationCoordinator
    ) {
        this(
                roomStore,
                membershipStore,
                executor,
                fingerprintFactory,
                idGenerator,
                clock,
                properties,
                new RoomCommandPostCommitCoordinator(
                        RoomCommandEventPropagationCoordinator.disabled(),
                        accessRevocationCoordinator));
    }

    public RoomCommandService(
            RoomStore roomStore,
            MembershipStore membershipStore,
            IdempotentRoomCommandExecutor executor,
            RoomCommandFingerprintFactory fingerprintFactory,
            RoomCommandIdGenerator idGenerator,
            Clock clock,
            RoomCommandProperties properties,
            RoomCommandPostCommitCoordinator postCommitCoordinator
    ) {
        this.roomStore = Objects.requireNonNull(roomStore, "roomStore");
        this.membershipStore = Objects.requireNonNull(
                membershipStore,
                "membershipStore");
        this.executor = Objects.requireNonNull(executor, "executor");
        this.fingerprintFactory = Objects.requireNonNull(
                fingerprintFactory,
                "fingerprintFactory");
        this.idGenerator =
                Objects.requireNonNull(idGenerator, "idGenerator");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.properties =
                Objects.requireNonNull(properties, "properties");
        this.postCommitCoordinator = Objects.requireNonNull(
                postCommitCoordinator,
                "postCommitCoordinator");
    }

    public RoomCommandExecution createRoom(
            CreateRoomCommand command
    ) {
        String candidateRoomId = idGenerator.newRoomId();
        String candidateOwnerMembershipId =
                idGenerator.newMembershipId();
        Instant transitionTime = clock.instant();
        PreparedRoomCommand prepared = prepare(
                command,
                transitionTime,
                candidateRoomId,
                null);
        return complete(executor.execute(prepared, () -> {
            RoomCreationResult creation =
                    RoomMembershipTransitions.createRoom(
                            candidateRoomId,
                            command.name(),
                            candidateOwnerMembershipId,
                            command.requesterUserId(),
                            command.visibility(),
                            command.joinPolicy(),
                            transitionTime);
            roomStore.insert(creation.room());
            membershipStore.insert(creation.ownerMembership());
            return RoomCommandResult.created(
                    creation.room(),
                    creation.ownerMembership());
        }));
    }

    public RoomCommandExecution joinRoom(JoinRoomCommand command) {
        String candidateMembershipId =
                idGenerator.newMembershipId();
        Instant transitionTime = clock.instant();
        PreparedRoomCommand prepared = prepare(
                command,
                transitionTime,
                command.roomId(),
                null);
        return complete(executor.execute(prepared, () -> executeDomain(
                command.commandType(),
                command.roomId(),
                null,
                () -> joinRoomInTransaction(
                        command,
                        candidateMembershipId,
                        transitionTime))));
    }

    public RoomCommandExecution leaveRoom(LeaveRoomCommand command) {
        Instant transitionTime = clock.instant();
        PreparedRoomCommand prepared = prepare(
                command,
                transitionTime,
                command.roomId(),
                null);
        RoomCommandExecution execution = executor.execute(
                prepared, () -> executeDomain(
                command.commandType(),
                command.roomId(),
                null,
                () -> leaveRoomInTransaction(
                        command,
                        transitionTime)));
        return complete(execution);
    }

    public RoomCommandExecution transferOwnership(
            TransferOwnershipCommand command
    ) {
        Instant transitionTime = clock.instant();
        PreparedRoomCommand prepared = prepare(
                command,
                transitionTime,
                command.roomId(),
                command.targetUserId());
        return complete(executor.execute(prepared, () -> executeDomain(
                command.commandType(),
                command.roomId(),
                command.targetUserId(),
                () -> transferOwnershipInTransaction(command))));
    }

    public RoomCommandExecution banMember(BanMemberCommand command) {
        Instant transitionTime = clock.instant();
        PreparedRoomCommand prepared = prepare(
                command,
                transitionTime,
                command.roomId(),
                command.targetUserId());
        RoomCommandExecution execution = executor.execute(
                prepared, () -> executeDomain(
                command.commandType(),
                command.roomId(),
                command.targetUserId(),
                () -> banMemberInTransaction(
                        command,
                        transitionTime)));
        return complete(execution);
    }

    public RoomCommandExecution unbanMember(
            UnbanMemberCommand command
    ) {
        Instant transitionTime = clock.instant();
        PreparedRoomCommand prepared = prepare(
                command,
                transitionTime,
                command.roomId(),
                command.targetUserId());
        return complete(executor.execute(prepared, () -> executeDomain(
                command.commandType(),
                command.roomId(),
                command.targetUserId(),
                () -> unbanMemberInTransaction(
                        command,
                        transitionTime))));
    }

    public RoomCommandExecution closeRoom(CloseRoomCommand command) {
        Instant transitionTime = clock.instant();
        PreparedRoomCommand prepared = prepare(
                command,
                transitionTime,
                command.roomId(),
                null);
        RoomCommandExecution execution = executor.execute(
                prepared, () -> executeDomain(
                command.commandType(),
                command.roomId(),
                null,
                () -> closeRoomInTransaction(
                        command,
                        transitionTime)));
        return complete(execution);
    }

    private RoomCommandExecution complete(
            RoomCommandExecution execution
    ) {
        postCommitCoordinator.afterCommand(execution);
        return execution;
    }

    private RoomCommandResult joinRoomInTransaction(
            JoinRoomCommand command,
            String candidateMembershipId,
            Instant transitionTime
    ) {
        Room room = roomStore.findById(command.roomId())
                .orElse(null);
        if (room == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.ROOM_NOT_FOUND,
                    command.roomId(),
                    null);
        }
        requireOwnerInvariant(room);
        Membership existing = membershipStore
                .findByRoomIdAndUserId(
                        room.roomId(),
                        command.requesterUserId())
                .orElse(null);
        JoinRoomTransition transition =
                RoomMembershipTransitions.joinRoom(
                        room,
                        existing,
                        candidateMembershipId,
                        command.requesterUserId(),
                        transitionTime);
        if (transition.outcome()
                == JoinRoomTransition.Outcome.JOINED) {
            replaceRoom(transition.room(), room.version());
            membershipStore.insert(transition.membership());
        } else if (transition.outcome()
                == JoinRoomTransition.Outcome.REJOINED) {
            replaceRoom(transition.room(), room.version());
            replaceMembership(
                    transition.membership(),
                    existing.version());
        }
        return RoomCommandResult.membership(
                command.commandType(),
                RoomCommandResultCode.valueOf(
                        transition.outcome().name()),
                transition.room(),
                transition.membership());
    }

    private RoomCommandResult leaveRoomInTransaction(
            LeaveRoomCommand command,
            Instant transitionTime
    ) {
        Room room = roomStore.findById(command.roomId())
                .orElse(null);
        if (room == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.ROOM_NOT_FOUND,
                    command.roomId(),
                    null);
        }
        requireOwnerInvariant(room);
        if (room.status() == RoomStatus.CLOSED) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.ROOM_CLOSED,
                    command.roomId(),
                    null);
        }
        Membership membership = membershipStore
                .findByRoomIdAndUserId(
                        room.roomId(),
                        command.requesterUserId())
                .orElse(null);
        if (membership == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.MEMBERSHIP_NOT_FOUND,
                    command.roomId(),
                    null);
        }
        LeaveRoomTransition transition =
                RoomMembershipTransitions.leaveRoom(
                        room,
                        membership,
                        command.requesterUserId(),
                        transitionTime);
        if (transition.outcome()
                == LeaveRoomTransition.Outcome.LEFT) {
            replaceRoom(transition.room(), room.version());
            replaceMembership(
                    transition.membership(),
                    membership.version());
        }
        return RoomCommandResult.membership(
                command.commandType(),
                RoomCommandResultCode.valueOf(
                        transition.outcome().name()),
                transition.room(),
                transition.membership());
    }

    private RoomCommandResult transferOwnershipInTransaction(
            TransferOwnershipCommand command
    ) {
        Room room = roomStore.findById(command.roomId())
                .orElse(null);
        if (room == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.ROOM_NOT_FOUND,
                    command.roomId(),
                    command.targetUserId());
        }
        Membership currentOwner = requireOwnerInvariant(room);
        RoomCommandResult precondition = ownerCommandRejection(
                command.commandType(),
                room,
                command.requesterUserId(),
                command.targetUserId());
        if (precondition != null) {
            return precondition;
        }
        Membership target = membershipStore
                .findByRoomIdAndUserId(
                        room.roomId(),
                        command.targetUserId())
                .orElse(null);
        if (target == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.TARGET_MEMBERSHIP_NOT_FOUND,
                    command.roomId(),
                    command.targetUserId());
        }
        OwnershipTransferTransition transition =
                RoomMembershipTransitions.transferOwnership(
                        room,
                        currentOwner,
                        target,
                        command.requesterUserId());
        replaceRoom(transition.room(), room.version());
        replaceMembership(
                transition.previousOwnerMembership(),
                currentOwner.version());
        replaceMembership(
                transition.newOwnerMembership(),
                target.version());
        return RoomCommandResult.ownershipTransferred(
                transition.room(),
                transition.previousOwnerMembership(),
                transition.newOwnerMembership());
    }

    private RoomCommandResult banMemberInTransaction(
            BanMemberCommand command,
            Instant transitionTime
    ) {
        Room room = roomStore.findById(command.roomId())
                .orElse(null);
        if (room == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.ROOM_NOT_FOUND,
                    command.roomId(),
                    command.targetUserId());
        }
        requireOwnerInvariant(room);
        RoomCommandResult precondition = ownerCommandRejection(
                command.commandType(),
                room,
                command.requesterUserId(),
                command.targetUserId());
        if (precondition != null) {
            return precondition;
        }
        Membership target = membershipStore
                .findByRoomIdAndUserId(
                        room.roomId(),
                        command.targetUserId())
                .orElse(null);
        if (target == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.TARGET_MEMBERSHIP_NOT_FOUND,
                    command.roomId(),
                    command.targetUserId());
        }
        BanMemberTransition transition =
                RoomMembershipTransitions.banMember(
                        room,
                        target,
                        command.requesterUserId(),
                        transitionTime);
        if (transition.outcome()
                == BanMemberTransition.Outcome.BANNED) {
            replaceRoom(transition.room(), room.version());
            replaceMembership(
                    transition.membership(),
                    target.version());
        }
        return RoomCommandResult.targetMembership(
                command.commandType(),
                RoomCommandResultCode.valueOf(
                        transition.outcome().name()),
                transition.room(),
                transition.membership());
    }

    private RoomCommandResult unbanMemberInTransaction(
            UnbanMemberCommand command,
            Instant transitionTime
    ) {
        Room room = roomStore.findById(command.roomId())
                .orElse(null);
        if (room == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.ROOM_NOT_FOUND,
                    command.roomId(),
                    command.targetUserId());
        }
        requireOwnerInvariant(room);
        RoomCommandResult precondition = ownerCommandRejection(
                command.commandType(),
                room,
                command.requesterUserId(),
                command.targetUserId());
        if (precondition != null) {
            return precondition;
        }
        Membership target = membershipStore
                .findByRoomIdAndUserId(
                        room.roomId(),
                        command.targetUserId())
                .orElse(null);
        if (target == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.TARGET_MEMBERSHIP_NOT_FOUND,
                    command.roomId(),
                    command.targetUserId());
        }
        UnbanMemberTransition transition =
                RoomMembershipTransitions.unbanMember(
                        room,
                        target,
                        command.requesterUserId(),
                        transitionTime);
        if (transition.outcome()
                == UnbanMemberTransition.Outcome.UNBANNED) {
            replaceRoom(transition.room(), room.version());
            replaceMembership(
                    transition.membership(),
                    target.version());
        }
        return RoomCommandResult.targetMembership(
                command.commandType(),
                RoomCommandResultCode.valueOf(
                        transition.outcome().name()),
                transition.room(),
                transition.membership());
    }

    private RoomCommandResult closeRoomInTransaction(
            CloseRoomCommand command,
            Instant transitionTime
    ) {
        Room room = roomStore.findById(command.roomId())
                .orElse(null);
        if (room == null) {
            return rejection(
                    command.commandType(),
                    RoomCommandResultCode.ROOM_NOT_FOUND,
                    command.roomId(),
                    null);
        }
        Membership owner = requireOwnerInvariant(room);
        CloseRoomTransition transition =
                RoomMembershipTransitions.closeRoom(
                        room,
                        owner,
                        command.requesterUserId(),
                        transitionTime);
        if (transition.outcome()
                == CloseRoomTransition.Outcome.CLOSED) {
            replaceRoom(transition.room(), room.version());
            replaceMembership(
                    transition.ownerMembership(),
                    owner.version());
        }
        return RoomCommandResult.closed(
                RoomCommandResultCode.valueOf(
                        transition.outcome().name()),
                transition.room(),
                transition.ownerMembership());
    }

    private PreparedRoomCommand prepare(
            RoomCommand command,
            Instant completedAt,
            String roomId,
            String targetUserId
    ) {
        return new PreparedRoomCommand(
                command.requesterUserId(),
                command.clientRequestId(),
                command.commandType(),
                fingerprintFactory.create(command),
                idGenerator.newReceiptId(),
                completedAt,
                completedAt.plus(properties.receiptTtl()),
                roomId,
                targetUserId);
    }

    private Membership requireOwnerInvariant(Room room) {
        Membership owner = membershipStore
                .findByRoomIdAndUserId(
                        room.roomId(),
                        room.ownerUserId())
                .orElseThrow(() -> dataIntegrity(
                        "Room owner membership is missing"));
        MembershipStatus requiredStatus =
                room.status() == RoomStatus.ACTIVE
                        ? MembershipStatus.ACTIVE
                        : MembershipStatus.LEFT;
        if (!owner.roomId().equals(room.roomId())
                || !owner.userId().equals(room.ownerUserId())
                || owner.role() != MembershipRole.OWNER
                || owner.status() != requiredStatus) {
            throw dataIntegrity(
                    "Room owner membership invariant is broken");
        }
        return owner;
    }

    private RoomCommandResult ownerCommandRejection(
            RoomCommandType commandType,
            Room room,
            String requesterUserId,
            String targetUserId
    ) {
        if (room.status() == RoomStatus.CLOSED) {
            return rejection(
                    commandType,
                    RoomCommandResultCode.ROOM_CLOSED,
                    room.roomId(),
                    targetUserId);
        }
        if (!room.ownerUserId().equals(requesterUserId)) {
            return rejection(
                    commandType,
                    RoomCommandResultCode.NOT_ROOM_OWNER,
                    room.roomId(),
                    targetUserId);
        }
        return null;
    }

    private void replaceRoom(Room room, long expectedVersion) {
        if (!roomStore.replaceIfVersionMatches(
                room,
                expectedVersion)) {
            throw new RoomOptimisticConflictException(
                    "Room version changed: " + room.roomId());
        }
    }

    private void replaceMembership(
            Membership membership,
            long expectedVersion
    ) {
        if (!membershipStore.replaceIfVersionMatches(
                membership,
                expectedVersion)) {
            throw new RoomOptimisticConflictException(
                    "Membership version changed: "
                            + membership.membershipId());
        }
    }

    private RoomCommandResult executeDomain(
            RoomCommandType commandType,
            String roomId,
            String targetUserId,
            Supplier<RoomCommandResult> action
    ) {
        try {
            return action.get();
        } catch (RoomDomainException exception) {
            RoomCommandResultCode code =
                    deterministicResultCode(exception.code());
            if (code == null) {
                throw dataIntegrity(
                        "Room domain invariant failure: "
                                + exception.code(),
                        exception);
            }
            return rejection(
                    commandType,
                    code,
                    roomId,
                    targetUserId);
        }
    }

    private RoomCommandResult rejection(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            String roomId,
            String targetUserId
    ) {
        return RoomCommandResult.rejection(
                commandType,
                code,
                roomId,
                targetUserId);
    }

    private RoomCommandResultCode deterministicResultCode(
            RoomDomainErrorCode code
    ) {
        return switch (code) {
            case ROOM_CLOSED,
                    JOIN_POLICY_NOT_OPEN,
                    NOT_ROOM_OWNER,
                    ROOM_HAS_OTHER_ACTIVE_MEMBERS,
                    OWNER_CANNOT_LEAVE,
                    OWNER_CANNOT_BE_BANNED,
                    MEMBERSHIP_BANNED,
                    TARGET_MEMBERSHIP_NOT_ACTIVE,
                    TARGET_MEMBERSHIP_NOT_MEMBER,
                    OWNERSHIP_TARGET_MUST_DIFFER ->
                    RoomCommandResultCode.valueOf(code.name());
            default -> null;
        };
    }

    private RoomCommandExecutionException dataIntegrity(
            String message
    ) {
        return dataIntegrity(message, null);
    }

    private RoomCommandExecutionException dataIntegrity(
            String message,
            Throwable cause
    ) {
        return new RoomCommandExecutionException(
                RoomCommandFailureKind.DATA_INTEGRITY,
                message,
                cause);
    }
}
