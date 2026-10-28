package com.hamcheeze.chat.room;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.List;

public final class RoomMembershipTransitions {

    private RoomMembershipTransitions() {
    }

    public static RoomCreationResult createRoom(
            String roomId,
            String name,
            String description,
            List<RoomCategory> categories,
            String ownerMembershipId,
            String ownerUserId,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            Instant createdAt
    ) {
        Instant creationTime =
                RoomDomainValidation.requireTransitionTime(createdAt);
        Room room = Room.create(
                roomId,
                name,
                description,
                categories,
                ownerMembershipId,
                ownerUserId,
                visibility,
                joinPolicy,
                creationTime);
        Membership ownerMembership = Membership.createOwner(
                ownerMembershipId,
                room.roomId(),
                room.ownerUserId(),
                creationTime);
        return new RoomCreationResult(
                RoomCreationResult.Outcome.CREATED,
                room,
                ownerMembership);
    }

    public static RoomCreationResult createRoomWithCategoryIds(
            String roomId,
            String name,
            String description,
            List<String> categoryIds,
            String ownerMembershipId,
            String ownerUserId,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            Instant createdAt
    ) {
        Instant creationTime =
                RoomDomainValidation.requireTransitionTime(createdAt);
        Room room = Room.createWithCategoryIds(
                roomId,
                name,
                description,
                categoryIds,
                ownerMembershipId,
                ownerUserId,
                visibility,
                joinPolicy,
                creationTime);
        Membership ownerMembership = Membership.createOwner(
                ownerMembershipId,
                room.roomId(),
                room.ownerUserId(),
                creationTime);
        return new RoomCreationResult(
                RoomCreationResult.Outcome.CREATED,
                room,
                ownerMembership);
    }

    public static JoinRoomTransition joinRoom(
            Room room,
            Membership existingMembership,
            String membershipId,
            String userId,
            Instant transitionTime,
            long messageVisibleAfterSequence
    ) {
        return joinRoom(
                room,
                existingMembership,
                membershipId,
                userId,
                transitionTime,
                messageVisibleAfterSequence,
                true);
    }

    public static JoinRoomTransition joinRoom(
            Room room,
            Membership existingMembership,
            String membershipId,
            String userId,
            Instant transitionTime,
            long messageVisibleAfterSequence,
            boolean createNewParticipationIdentity
    ) {
        return joinRoom(
                room,
                existingMembership,
                membershipId,
                userId,
                transitionTime,
                messageVisibleAfterSequence,
                messageVisibleAfterSequence,
                createNewParticipationIdentity);
    }

    public static JoinRoomTransition joinRoom(
            Room room,
            Membership existingMembership,
            String membershipId,
            String userId,
            Instant transitionTime,
            long messageVisibleAfterSequence,
            long historyVisibleAfterSequence,
            boolean createNewParticipationIdentity
    ) {
        JoinRoomTransition.Outcome outcome = determineJoinOutcome(
                room,
                existingMembership,
                membershipId,
                userId,
                transitionTime);
        if (outcome == JoinRoomTransition.Outcome.ALREADY_ACTIVE) {
            return new JoinRoomTransition(
                    outcome,
                    room,
                    existingMembership,
                    false);
        }
        Instant joinedAt =
                requireTransitionTime(room, transitionTime);
        if (outcome == JoinRoomTransition.Outcome.JOINED) {
            Membership membership = Membership.createMember(
                    membershipId,
                    room.roomId(),
                    userId,
                    joinedAt,
                    messageVisibleAfterSequence,
                    historyVisibleAfterSequence,
                    room.nextParticipantNumber());
            return new JoinRoomTransition(
                    outcome,
                    room.memberJoined(),
                    membership,
                    true);
        }
        Membership membership = createNewParticipationIdentity
                ? existingMembership.reactivateAt(
                        joinedAt,
                        messageVisibleAfterSequence,
                        historyVisibleAfterSequence,
                        room.nextParticipantNumber())
                : existingMembership.reactivateAt(
                        joinedAt,
                        messageVisibleAfterSequence,
                        historyVisibleAfterSequence);
        return new JoinRoomTransition(
                outcome,
                createNewParticipationIdentity
                        ? room.memberRejoined()
                        : room.memberRejoinedWithoutNewIdentity(),
                membership,
                false);
    }

    public static JoinRoomTransition.Outcome determineJoinOutcome(
            Room room,
            Membership existingMembership,
            String membershipId,
            String userId,
            Instant transitionTime
    ) {
        requireRoom(room);
        requireActive(room);
        requireTransitionTime(room, transitionTime);
        if (room.joinPolicy() != JoinPolicy.OPEN) {
            throw failure(RoomDomainErrorCode.JOIN_POLICY_NOT_OPEN);
        }
        String targetUserId =
                RoomDomainValidation.requireUserId(userId);
        if (existingMembership == null) {
            RoomDomainValidation.requireMembershipId(membershipId);
            if (targetUserId.equals(room.ownerUserId())) {
                throw failure(
                        RoomDomainErrorCode
                                .OWNER_MEMBERSHIP_MISMATCH);
            }
            return JoinRoomTransition.Outcome.JOINED;
        }
        requireSameRoom(room, existingMembership);
        requireSameUser(targetUserId, existingMembership);
        requireOwnerRoleConsistency(room, existingMembership);
        if (existingMembership.role() == MembershipRole.OWNER
                && existingMembership.status()
                != MembershipStatus.ACTIVE) {
            throw failure(
                    RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
        }
        if (existingMembership.status()
                == MembershipStatus.ACTIVE) {
            return JoinRoomTransition.Outcome.ALREADY_ACTIVE;
        }
        if (existingMembership.status()
                == MembershipStatus.BANNED) {
            throw failure(RoomDomainErrorCode.MEMBERSHIP_BANNED);
        }
        return JoinRoomTransition.Outcome.REJOINED;
    }

    public static LeaveRoomTransition leaveRoom(
            Room room,
            Membership membership,
            String userId,
            Instant transitionTime
    ) {
        requireRoom(room);
        requireActive(room);
        Membership existing = requireMembership(membership);
        requireSameRoom(room, existing);
        requireSameUser(
                RoomDomainValidation.requireUserId(userId),
                existing);
        requireOwnerRoleConsistency(room, existing);
        Instant leftAt =
                requireTransitionTime(room, transitionTime);
        if (existing.role() == MembershipRole.OWNER) {
            throw failure(RoomDomainErrorCode.OWNER_CANNOT_LEAVE);
        }
        if (existing.status() == MembershipStatus.BANNED) {
            throw failure(RoomDomainErrorCode.MEMBERSHIP_BANNED);
        }
        if (existing.status() == MembershipStatus.LEFT) {
            return new LeaveRoomTransition(
                    LeaveRoomTransition.Outcome.ALREADY_LEFT,
                    room,
                    existing);
        }
        Membership leftMembership = existing.leaveAt(leftAt);
        return new LeaveRoomTransition(
                LeaveRoomTransition.Outcome.LEFT,
                room.memberLeft(),
                leftMembership);
    }

    public static OwnershipTransferTransition transferOwnership(
            Room room,
            Membership currentOwnerMembership,
            Membership targetMembership,
            String requesterUserId
    ) {
        requireRoom(room);
        requireActive(room);
        requireOwnerRequester(room, requesterUserId);
        Membership currentOwner =
                requireMembership(currentOwnerMembership);
        Membership target =
                requireTargetMembership(targetMembership);
        requireActiveOwnerMembership(room, currentOwner);
        requireSameRoom(room, target);
        requireOwnerRoleConsistency(room, target);
        if (target.userId().equals(room.ownerUserId())) {
            throw failure(
                    RoomDomainErrorCode.OWNERSHIP_TARGET_MUST_DIFFER);
        }
        if (target.role() != MembershipRole.MEMBER) {
            throw failure(
                    RoomDomainErrorCode.TARGET_MEMBERSHIP_NOT_MEMBER);
        }
        if (target.status() != MembershipStatus.ACTIVE) {
            throw failure(
                    RoomDomainErrorCode.TARGET_MEMBERSHIP_NOT_ACTIVE);
        }

        Room transferredRoom =
                room.transferOwnershipTo(
                        target.membershipId(),
                        target.userId());
        Membership previousOwner =
                currentOwner.demoteToMember();
        Membership newOwner =
                target.promoteToOwner();
        return new OwnershipTransferTransition(
                OwnershipTransferTransition.Outcome
                        .OWNERSHIP_TRANSFERRED,
                transferredRoom,
                previousOwner,
                newOwner);
    }

    public static BanMemberTransition banMember(
            Room room,
            Membership targetMembership,
            String requesterUserId,
            Instant transitionTime
    ) {
        requireRoom(room);
        requireActive(room);
        requireOwnerRequester(room, requesterUserId);
        Membership target =
                requireTargetMembership(targetMembership);
        requireSameRoom(room, target);
        requireOwnerRoleConsistency(room, target);
        Instant bannedAt =
                requireTransitionTime(room, transitionTime);
        requireMemberTarget(target);
        if (target.status() == MembershipStatus.BANNED) {
            return new BanMemberTransition(
                    BanMemberTransition.Outcome.ALREADY_BANNED,
                    room,
                    target);
        }

        Membership bannedMembership = target.banAt(bannedAt);
        Room changedRoom =
                target.status() == MembershipStatus.ACTIVE
                        ? room.memberLeft()
                        : room.memberStateChangedWithoutCountChange();
        return new BanMemberTransition(
                BanMemberTransition.Outcome.BANNED,
                changedRoom,
                bannedMembership);
    }

    public static UnbanMemberTransition unbanMember(
            Room room,
            Membership targetMembership,
            String requesterUserId,
            Instant transitionTime
    ) {
        requireRoom(room);
        requireActive(room);
        requireOwnerRequester(room, requesterUserId);
        Membership target =
                requireTargetMembership(targetMembership);
        requireSameRoom(room, target);
        requireOwnerRoleConsistency(room, target);
        Instant leftAt =
                requireTransitionTime(room, transitionTime);
        requireMemberTarget(target);
        if (target.status() != MembershipStatus.BANNED) {
            return new UnbanMemberTransition(
                    UnbanMemberTransition.Outcome.ALREADY_UNBANNED,
                    room,
                    target);
        }

        return new UnbanMemberTransition(
                UnbanMemberTransition.Outcome.UNBANNED,
                room.memberStateChangedWithoutCountChange(),
                target.unbanAt(leftAt));
    }

    public static CloseRoomTransition closeRoom(
            Room room,
            Membership ownerMembership,
            String requesterUserId,
            Instant transitionTime
    ) {
        requireRoom(room);
        requireOwnerRequester(room, requesterUserId);
        Membership owner = requireMembership(ownerMembership);
        Instant closedAt =
                requireTransitionTime(room, transitionTime);
        if (room.status() == RoomStatus.CLOSED) {
            requireClosedOwnerMembership(room, owner);
            return new CloseRoomTransition(
                    CloseRoomTransition.Outcome.ALREADY_CLOSED,
                    room,
                    owner);
        }
        requireActiveOwnerMembership(room, owner);
        if (room.activeMemberCount() > 1) {
            throw failure(
                    RoomDomainErrorCode
                            .ROOM_HAS_OTHER_ACTIVE_MEMBERS);
        }

        return new CloseRoomTransition(
                CloseRoomTransition.Outcome.CLOSED,
                room.closeAt(closedAt),
                owner.leaveAt(closedAt));
    }

    public static AdministrativeCloseRoomTransition
            closeRoomAsAdministrator(
                    Room room,
                    Membership ownerMembership,
                    List<Membership> activeMemberships,
                    Instant transitionTime
            ) {
        requireRoom(room);
        Membership owner = requireMembership(ownerMembership);
        Instant closedAt =
                requireTransitionTime(room, transitionTime);
        List<Membership> active = List.copyOf(
                activeMemberships == null
                        ? List.of()
                        : activeMemberships);
        if (room.status() == RoomStatus.CLOSED) {
            requireClosedOwnerMembership(room, owner);
            if (!active.isEmpty()) {
                throw failure(RoomDomainErrorCode.INVALID_DOMAIN_STATE);
            }
            return new AdministrativeCloseRoomTransition(
                    AdministrativeCloseRoomTransition.Outcome
                            .ALREADY_CLOSED,
                    room,
                    owner,
                    List.of());
        }

        requireActiveOwnerMembership(room, owner);
        if (active.size() != room.activeMemberCount()) {
            throw failure(
                    RoomDomainErrorCode
                            .ACTIVE_MEMBER_COUNT_INVARIANT_VIOLATION);
        }

        Set<String> membershipIds = new HashSet<>();
        boolean ownerIncluded = false;
        for (Membership membership : active) {
            Membership current = requireMembership(membership);
            requireSameRoom(room, current);
            requireOwnerRoleConsistency(room, current);
            if (current.status() != MembershipStatus.ACTIVE
                    || !membershipIds.add(current.membershipId())) {
                throw failure(RoomDomainErrorCode.INVALID_DOMAIN_STATE);
            }
            if (current.membershipId().equals(owner.membershipId())) {
                ownerIncluded = true;
            }
        }
        if (!ownerIncluded) {
            throw failure(
                    RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
        }

        List<Membership> closedMemberships = active.stream()
                .map(membership -> membership.leaveAt(closedAt))
                .toList();
        Membership closedOwner = closedMemberships.stream()
                .filter(membership -> membership.membershipId()
                        .equals(owner.membershipId()))
                .findFirst()
                .orElseThrow(() -> failure(
                        RoomDomainErrorCode
                                .OWNER_MEMBERSHIP_MISMATCH));
        return new AdministrativeCloseRoomTransition(
                AdministrativeCloseRoomTransition.Outcome.CLOSED,
                room.closeAt(closedAt),
                closedOwner,
                closedMemberships);
    }

    private static void requireRoom(Room room) {
        if (room == null) {
            throw failure(RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
    }

    private static Membership requireMembership(
            Membership membership
    ) {
        if (membership == null) {
            throw failure(RoomDomainErrorCode.MEMBERSHIP_NOT_FOUND);
        }
        return membership;
    }

    private static Membership requireTargetMembership(
            Membership membership
    ) {
        if (membership == null) {
            throw failure(
                    RoomDomainErrorCode.TARGET_MEMBERSHIP_NOT_FOUND);
        }
        return membership;
    }

    private static void requireActive(Room room) {
        if (room.status() == RoomStatus.CLOSED) {
            throw failure(RoomDomainErrorCode.ROOM_CLOSED);
        }
    }

    private static void requireOwnerRequester(
            Room room,
            String requesterUserId
    ) {
        String requester =
                RoomDomainValidation.requireUserId(requesterUserId);
        if (!room.ownerUserId().equals(requester)) {
            throw failure(RoomDomainErrorCode.NOT_ROOM_OWNER);
        }
    }

    private static void requireSameRoom(
            Room room,
            Membership membership
    ) {
        if (!room.roomId().equals(membership.roomId())) {
            throw failure(
                    RoomDomainErrorCode.MEMBERSHIP_ROOM_MISMATCH);
        }
    }

    private static void requireSameUser(
            String userId,
            Membership membership
    ) {
        if (!userId.equals(membership.userId())) {
            throw failure(
                    RoomDomainErrorCode.MEMBERSHIP_USER_MISMATCH);
        }
    }

    private static void requireOwnerRoleConsistency(
            Room room,
            Membership membership
    ) {
        boolean matchesOwnerUser =
                membership.userId().equals(room.ownerUserId());
        boolean matchesOwnerMembership =
                membership.membershipId().equals(
                        room.ownerMembershipId());
        boolean representsRoomOwner =
                matchesOwnerUser && matchesOwnerMembership;
        boolean hasOwnerRole =
                membership.role() == MembershipRole.OWNER;
        if (matchesOwnerUser != matchesOwnerMembership
                || representsRoomOwner != hasOwnerRole) {
            throw failure(
                    RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
        }
    }

    private static void requireActiveOwnerMembership(
            Room room,
            Membership ownerMembership
    ) {
        if (!room.roomId().equals(ownerMembership.roomId())
                || !room.ownerMembershipId().equals(
                        ownerMembership.membershipId())
                || !room.ownerUserId().equals(
                        ownerMembership.userId())
                || ownerMembership.role() != MembershipRole.OWNER
                || ownerMembership.status()
                != MembershipStatus.ACTIVE) {
            throw failure(
                    RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
        }
    }

    private static void requireClosedOwnerMembership(
            Room room,
            Membership ownerMembership
    ) {
        if (!room.roomId().equals(ownerMembership.roomId())
                || !room.ownerMembershipId().equals(
                        ownerMembership.membershipId())
                || !room.ownerUserId().equals(
                        ownerMembership.userId())
                || ownerMembership.role() != MembershipRole.OWNER
                || ownerMembership.status()
                != MembershipStatus.LEFT) {
            throw failure(
                    RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
        }
    }

    private static void requireMemberTarget(Membership target) {
        if (target.role() == MembershipRole.OWNER) {
            throw failure(
                    RoomDomainErrorCode.OWNER_CANNOT_BE_BANNED);
        }
        if (target.role() != MembershipRole.MEMBER) {
            throw failure(
                    RoomDomainErrorCode.TARGET_MEMBERSHIP_NOT_MEMBER);
        }
    }

    private static RoomDomainException failure(
            RoomDomainErrorCode code
    ) {
        return new RoomDomainException(code);
    }

    private static Instant requireTransitionTime(
            Room room,
            Instant transitionTime
    ) {
        Instant validated =
                RoomDomainValidation.requireTransitionTime(
                        transitionTime);
        RoomDomainValidation.requireNotBefore(
                validated,
                room.createdAt());
        return validated;
    }
}
