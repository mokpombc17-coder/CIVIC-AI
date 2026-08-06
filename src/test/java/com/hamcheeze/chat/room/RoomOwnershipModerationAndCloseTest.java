package com.hamcheeze.chat.room;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomOwnershipModerationAndCloseTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-28T00:00:00Z");
    private static final Instant TRANSITION_AT =
            CREATED_AT.plusSeconds(60);

    @Test
    void transfersOwnershipToActiveMember() {
        Room room = activeRoom("owner-1", 2, 3);
        Membership owner = owner("owner-1", MembershipStatus.ACTIVE, 4);
        Membership target =
                member("user-2", MembershipStatus.ACTIVE, 5);

        OwnershipTransferTransition result =
                RoomMembershipTransitions.transferOwnership(
                        room,
                        owner,
                        target,
                        "owner-1");

        assertThat(result.outcome()).isEqualTo(
                OwnershipTransferTransition.Outcome
                        .OWNERSHIP_TRANSFERRED);
        assertThat(result.room().ownerUserId()).isEqualTo("user-2");
        assertThat(result.room().activeMemberCount()).isEqualTo(2);
        assertThat(result.room().version()).isEqualTo(4);
        assertThat(result.previousOwnerMembership().role())
                .isEqualTo(MembershipRole.MEMBER);
        assertThat(result.newOwnerMembership().role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(result.previousOwnerMembership().status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(result.newOwnerMembership().status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(result.previousOwnerMembership().version())
                .isEqualTo(5);
        assertThat(result.newOwnerMembership().version())
                .isEqualTo(6);
        assertThat(result.previousOwnerMembership()
                .messageVisibleAfterSequence()).isEqualTo(10);
        assertThat(result.newOwnerMembership()
                .messageVisibleAfterSequence()).isEqualTo(10);
        assertTimesUnchanged(owner, result.previousOwnerMembership());
        assertTimesUnchanged(target, result.newOwnerMembership());
    }

    @Test
    void rejectsInactiveOwnershipTargets() {
        Room room = activeRoom("owner-1", 1, 0);
        Membership owner = owner("owner-1", MembershipStatus.ACTIVE, 0);

        assertFailure(
                () -> RoomMembershipTransitions.transferOwnership(
                        room,
                        owner,
                        member("user-2", MembershipStatus.LEFT, 0),
                        "owner-1"),
                RoomDomainErrorCode.TARGET_MEMBERSHIP_NOT_ACTIVE);
        assertFailure(
                () -> RoomMembershipTransitions.transferOwnership(
                        room,
                        owner,
                        member("user-2", MembershipStatus.BANNED, 0),
                        "owner-1"),
                RoomDomainErrorCode.TARGET_MEMBERSHIP_NOT_ACTIVE);
    }

    @Test
    void rejectsInvalidOwnershipTargetAndRequester() {
        Room room = activeRoom("owner-1", 2, 0);
        Membership owner = owner("owner-1", MembershipStatus.ACTIVE, 0);
        Membership otherRoom = Membership.restore(
                "membership-user-2",
                "room-2",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                CREATED_AT,
                null,
                null,
                10,
                0);

        assertFailure(
                () -> RoomMembershipTransitions.transferOwnership(
                        room,
                        owner,
                        otherRoom,
                        "owner-1"),
                RoomDomainErrorCode.MEMBERSHIP_ROOM_MISMATCH);
        assertFailure(
                () -> RoomMembershipTransitions.transferOwnership(
                        room,
                        owner,
                        owner,
                        "owner-1"),
                RoomDomainErrorCode.OWNERSHIP_TARGET_MUST_DIFFER);
        assertFailure(
                () -> RoomMembershipTransitions.transferOwnership(
                        room,
                        owner,
                        member("user-2", MembershipStatus.ACTIVE, 0),
                        "user-2"),
                RoomDomainErrorCode.NOT_ROOM_OWNER);
    }

    @Test
    void rejectsNonOwnerTargetWithOwnerRole() {
        Room room = activeRoom("owner-1", 2, 0);
        Membership currentOwner =
                owner("owner-1", MembershipStatus.ACTIVE, 0);
        Membership anotherOwner =
                owner("user-2", MembershipStatus.ACTIVE, 0);

        assertFailure(
                () -> RoomMembershipTransitions.transferOwnership(
                        room,
                        currentOwner,
                        anotherOwner,
                        "owner-1"),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
    }

    @Test
    void ownerMembershipMismatchLeavesAllObjectsUnchanged() {
        Room room = activeRoom("owner-1", 2, 7);
        Membership mismatchedOwner =
                owner("someone-else", MembershipStatus.ACTIVE, 2);
        Membership target =
                member("user-2", MembershipStatus.ACTIVE, 3);

        assertFailure(
                () -> RoomMembershipTransitions.transferOwnership(
                        room,
                        mismatchedOwner,
                        target,
                        "owner-1"),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);

        assertThat(room.ownerUserId()).isEqualTo("owner-1");
        assertThat(room.version()).isEqualTo(7);
        assertThat(mismatchedOwner.role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(mismatchedOwner.version()).isEqualTo(2);
        assertThat(target.role()).isEqualTo(MembershipRole.MEMBER);
        assertThat(target.version()).isEqualTo(3);
    }

    @Test
    void previousOwnerCanLeaveAfterOwnershipTransfer() {
        OwnershipTransferTransition transferred =
                RoomMembershipTransitions.transferOwnership(
                        activeRoom("owner-1", 2, 0),
                        owner("owner-1", MembershipStatus.ACTIVE, 0),
                        member("user-2", MembershipStatus.ACTIVE, 0),
                        "owner-1");

        LeaveRoomTransition left =
                RoomMembershipTransitions.leaveRoom(
                        transferred.room(),
                        transferred.previousOwnerMembership(),
                        "owner-1",
                        TRANSITION_AT);

        assertThat(left.outcome())
                .isEqualTo(LeaveRoomTransition.Outcome.LEFT);
        assertThat(left.membership().role())
                .isEqualTo(MembershipRole.MEMBER);
        assertThat(left.membership().status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(left.room().activeMemberCount()).isEqualTo(1);
    }

    @Test
    void bansActiveMemberAndDecrementsCount() {
        Room room = activeRoom("owner-1", 2, 3);
        Membership member =
                member("user-2", MembershipStatus.ACTIVE, 4);

        BanMemberTransition result =
                RoomMembershipTransitions.banMember(
                        room,
                        member,
                        "owner-1",
                        TRANSITION_AT);

        assertThat(result.outcome())
                .isEqualTo(BanMemberTransition.Outcome.BANNED);
        assertThat(result.room().activeMemberCount()).isEqualTo(1);
        assertThat(result.room().version()).isEqualTo(4);
        assertThat(result.membership().status())
                .isEqualTo(MembershipStatus.BANNED);
        assertThat(result.membership().bannedAt())
                .isEqualTo(TRANSITION_AT);
        assertThat(result.membership().leftAt()).isNull();
        assertThat(result.membership().messageVisibleAfterSequence())
                .isEqualTo(10);
        assertThat(result.membership().version()).isEqualTo(5);
    }

    @Test
    void bansLeftMemberWithoutChangingCount() {
        Room room = activeRoom("owner-1", 1, 3);
        Membership member =
                member("user-2", MembershipStatus.LEFT, 4);

        BanMemberTransition result =
                RoomMembershipTransitions.banMember(
                        room,
                        member,
                        "owner-1",
                        TRANSITION_AT);

        assertThat(result.room().activeMemberCount()).isEqualTo(1);
        assertThat(result.room().version()).isEqualTo(4);
        assertThat(result.membership().status())
                .isEqualTo(MembershipStatus.BANNED);
        assertThat(result.membership().leftAt()).isNull();
        assertThat(result.membership().bannedAt())
                .isEqualTo(TRANSITION_AT);
        assertThat(result.membership().version()).isEqualTo(5);
    }

    @Test
    void bannedMemberBanIsBusinessNoOp() {
        Room room = activeRoom("owner-1", 1, 7);
        Membership member =
                member("user-2", MembershipStatus.BANNED, 4);

        BanMemberTransition result =
                RoomMembershipTransitions.banMember(
                        room,
                        member,
                        "owner-1",
                        TRANSITION_AT);

        assertThat(result.outcome()).isEqualTo(
                BanMemberTransition.Outcome.ALREADY_BANNED);
        assertThat(result.room()).isSameAs(room);
        assertThat(result.membership()).isSameAs(member);
        assertThat(result.room().version()).isEqualTo(7);
        assertThat(result.membership().version()).isEqualTo(4);
        assertThat(result.membership().bannedAt())
                .isEqualTo(CREATED_AT.plusSeconds(20));
    }

    @Test
    void rejectsInvalidBanRequests() {
        Room room = activeRoom("owner-1", 2, 0);
        Membership active =
                member("user-2", MembershipStatus.ACTIVE, 0);
        Membership otherRoom = Membership.restore(
                "membership-user-2",
                "room-2",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                CREATED_AT,
                null,
                null,
                10,
                0);

        assertFailure(
                () -> RoomMembershipTransitions.banMember(
                        room,
                        owner("owner-1", MembershipStatus.ACTIVE, 0),
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_CANNOT_BE_BANNED);
        assertFailure(
                () -> RoomMembershipTransitions.banMember(
                        room, active, "user-2", TRANSITION_AT),
                RoomDomainErrorCode.NOT_ROOM_OWNER);
        assertFailure(
                () -> RoomMembershipTransitions.banMember(
                        room, otherRoom, "owner-1", TRANSITION_AT),
                RoomDomainErrorCode.MEMBERSHIP_ROOM_MISMATCH);
        assertFailure(
                () -> RoomMembershipTransitions.banMember(
                        closedRoom(),
                        active,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.ROOM_CLOSED);
        assertFailure(
                () -> RoomMembershipTransitions.banMember(
                        room,
                        null,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.TARGET_MEMBERSHIP_NOT_FOUND);
    }

    @Test
    void rejectsOwnerRoleMismatchesOnBan() {
        Room room = activeRoom("owner-1", 2, 7);
        Membership ownerWithMemberRole =
                member("owner-1", MembershipStatus.ACTIVE, 3);
        Membership nonOwnerWithOwnerRole =
                owner("user-2", MembershipStatus.ACTIVE, 4);

        assertFailure(
                () -> RoomMembershipTransitions.banMember(
                        room,
                        ownerWithMemberRole,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
        assertFailure(
                () -> RoomMembershipTransitions.banMember(
                        room,
                        nonOwnerWithOwnerRole,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);

        assertThat(room.activeMemberCount()).isEqualTo(2);
        assertThat(room.version()).isEqualTo(7);
        assertThat(ownerWithMemberRole.status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(ownerWithMemberRole.version()).isEqualTo(3);
        assertThat(nonOwnerWithOwnerRole.status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(nonOwnerWithOwnerRole.version()).isEqualTo(4);
    }

    @Test
    void activeBanCannotReduceCountBelowOwner() {
        Room room = activeRoom("owner-1", 1, 4);
        Membership member =
                member("user-2", MembershipStatus.ACTIVE, 2);

        assertFailure(
                () -> RoomMembershipTransitions.banMember(
                        room,
                        member,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode
                        .ACTIVE_MEMBER_COUNT_INVARIANT_VIOLATION);
        assertThat(room.activeMemberCount()).isEqualTo(1);
        assertThat(room.version()).isEqualTo(4);
        assertThat(member.status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(member.version()).isEqualTo(2);
    }

    @Test
    void unbansToLeftWithoutRejoining() {
        Room room = activeRoom("owner-1", 1, 3);
        Membership banned =
                member("user-2", MembershipStatus.BANNED, 4);

        UnbanMemberTransition result =
                RoomMembershipTransitions.unbanMember(
                        room,
                        banned,
                        "owner-1",
                        TRANSITION_AT);

        assertThat(result.outcome())
                .isEqualTo(UnbanMemberTransition.Outcome.UNBANNED);
        assertThat(result.room().activeMemberCount()).isEqualTo(1);
        assertThat(result.room().version()).isEqualTo(4);
        assertThat(result.membership().status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(result.membership().leftAt())
                .isEqualTo(TRANSITION_AT);
        assertThat(result.membership().bannedAt()).isNull();
        assertThat(result.membership().messageVisibleAfterSequence())
                .isEqualTo(10);
        assertThat(result.membership().version()).isEqualTo(5);
    }

    @Test
    void activeAndLeftUnbanAreBusinessNoOps() {
        Room room = activeRoom("owner-1", 2, 7);
        Membership active =
                member("user-2", MembershipStatus.ACTIVE, 4);
        Membership left =
                member("user-3", MembershipStatus.LEFT, 5);

        UnbanMemberTransition activeResult =
                RoomMembershipTransitions.unbanMember(
                        room,
                        active,
                        "owner-1",
                        TRANSITION_AT);
        UnbanMemberTransition leftResult =
                RoomMembershipTransitions.unbanMember(
                        room,
                        left,
                        "owner-1",
                        TRANSITION_AT);

        assertThat(activeResult.outcome()).isEqualTo(
                UnbanMemberTransition.Outcome.ALREADY_UNBANNED);
        assertThat(activeResult.room()).isSameAs(room);
        assertThat(activeResult.membership()).isSameAs(active);
        assertThat(leftResult.outcome()).isEqualTo(
                UnbanMemberTransition.Outcome.ALREADY_UNBANNED);
        assertThat(leftResult.room()).isSameAs(room);
        assertThat(leftResult.membership()).isSameAs(left);
        assertThat(room.version()).isEqualTo(7);
        assertThat(active.version()).isEqualTo(4);
        assertThat(left.version()).isEqualTo(5);
    }

    @Test
    void unbannedMemberCanJoinLater() {
        UnbanMemberTransition unbanned =
                RoomMembershipTransitions.unbanMember(
                        activeRoom("owner-1", 1, 0),
                        member("user-2", MembershipStatus.BANNED, 0),
                        "owner-1",
                        TRANSITION_AT);

        JoinRoomTransition joined =
                RoomMembershipTransitions.joinRoom(
                        unbanned.room(),
                        unbanned.membership(),
                        null,
                        "user-2",
                        TRANSITION_AT.plusSeconds(1),
                        30);

        assertThat(joined.outcome())
                .isEqualTo(JoinRoomTransition.Outcome.REJOINED);
        assertThat(joined.membership().status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(joined.membership().messageVisibleAfterSequence())
                .isEqualTo(30);
        assertThat(joined.room().activeMemberCount()).isEqualTo(2);
    }

    @Test
    void rejectsInvalidUnbanRequests() {
        Room room = activeRoom("owner-1", 1, 0);
        Membership banned =
                member("user-2", MembershipStatus.BANNED, 0);
        Membership otherRoom = Membership.restore(
                "membership-user-2",
                "room-2",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.BANNED,
                CREATED_AT,
                null,
                CREATED_AT.plusSeconds(20),
                10,
                0);

        assertFailure(
                () -> RoomMembershipTransitions.unbanMember(
                        room,
                        owner("owner-1", MembershipStatus.ACTIVE, 0),
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_CANNOT_BE_BANNED);
        assertFailure(
                () -> RoomMembershipTransitions.unbanMember(
                        room, banned, "user-2", TRANSITION_AT),
                RoomDomainErrorCode.NOT_ROOM_OWNER);
        assertFailure(
                () -> RoomMembershipTransitions.unbanMember(
                        closedRoom(),
                        banned,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.ROOM_CLOSED);
        assertFailure(
                () -> RoomMembershipTransitions.unbanMember(
                        room,
                        otherRoom,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.MEMBERSHIP_ROOM_MISMATCH);
    }

    @Test
    void rejectsOwnerRoleMismatchesOnUnban() {
        Room room = activeRoom("owner-1", 2, 7);
        Membership ownerWithMemberRole =
                member("owner-1", MembershipStatus.ACTIVE, 3);
        Membership nonOwnerWithOwnerRole =
                owner("user-2", MembershipStatus.LEFT, 4);

        assertFailure(
                () -> RoomMembershipTransitions.unbanMember(
                        room,
                        ownerWithMemberRole,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
        assertFailure(
                () -> RoomMembershipTransitions.unbanMember(
                        room,
                        nonOwnerWithOwnerRole,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);

        assertThat(room.activeMemberCount()).isEqualTo(2);
        assertThat(room.version()).isEqualTo(7);
        assertThat(ownerWithMemberRole.status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(ownerWithMemberRole.version()).isEqualTo(3);
        assertThat(nonOwnerWithOwnerRole.status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(nonOwnerWithOwnerRole.version()).isEqualTo(4);
    }

    @Test
    void closesRoomAndLeavesOwnerMembership() {
        Room room = activeRoom("owner-1", 1, 3);
        Membership owner =
                owner("owner-1", MembershipStatus.ACTIVE, 4);

        CloseRoomTransition result =
                RoomMembershipTransitions.closeRoom(
                        room,
                        owner,
                        "owner-1",
                        TRANSITION_AT);

        assertThat(result.outcome())
                .isEqualTo(CloseRoomTransition.Outcome.CLOSED);
        assertThat(result.room().status())
                .isEqualTo(RoomStatus.CLOSED);
        assertThat(result.room().closedAt())
                .isEqualTo(TRANSITION_AT);
        assertThat(result.room().activeMemberCount()).isZero();
        assertThat(result.room().ownerUserId()).isEqualTo("owner-1");
        assertThat(result.room().version()).isEqualTo(4);
        assertThat(result.ownerMembership().role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(result.ownerMembership().status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(result.ownerMembership().leftAt())
                .isEqualTo(TRANSITION_AT);
        assertThat(result.ownerMembership().version()).isEqualTo(5);
    }

    @Test
    void rejectsCloseWithOtherMembersOrNonOwner() {
        Room room = activeRoom("owner-1", 2, 7);
        Membership owner =
                owner("owner-1", MembershipStatus.ACTIVE, 4);

        assertFailure(
                () -> RoomMembershipTransitions.closeRoom(
                        room,
                        owner,
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.ROOM_HAS_OTHER_ACTIVE_MEMBERS);
        assertFailure(
                () -> RoomMembershipTransitions.closeRoom(
                        room,
                        owner,
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.NOT_ROOM_OWNER);

        assertThat(room.status()).isEqualTo(RoomStatus.ACTIVE);
        assertThat(room.activeMemberCount()).isEqualTo(2);
        assertThat(room.version()).isEqualTo(7);
        assertThat(owner.status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(owner.version()).isEqualTo(4);
    }

    @Test
    void closedRoomCloseIsBusinessNoOpAfterOwnerValidation() {
        Room room = closedRoom();
        Membership owner =
                owner("owner-1", MembershipStatus.LEFT, 5);

        CloseRoomTransition result =
                RoomMembershipTransitions.closeRoom(
                        room,
                        owner,
                        "owner-1",
                        TRANSITION_AT.plusSeconds(10));

        assertThat(result.outcome()).isEqualTo(
                CloseRoomTransition.Outcome.ALREADY_CLOSED);
        assertThat(result.room()).isSameAs(room);
        assertThat(result.ownerMembership()).isSameAs(owner);
        assertThat(result.room().version()).isEqualTo(8);
        assertThat(result.ownerMembership().version()).isEqualTo(5);
        assertThat(result.room().closedAt())
                .isEqualTo(CREATED_AT.plusSeconds(30));
        assertThat(result.ownerMembership().leftAt())
                .isEqualTo(CREATED_AT.plusSeconds(30));
    }

    @Test
    void closedRoomCannotBeReactivatedByJoin() {
        assertFailure(
                () -> RoomMembershipTransitions.joinRoom(
                        closedRoom(),
                        member("user-2", MembershipStatus.LEFT, 0),
                        null,
                        "user-2",
                        TRANSITION_AT,
                        10),
                RoomDomainErrorCode.ROOM_CLOSED);
    }

    @Test
    void closedRoomStillChecksRequesterAndOwnerMembership() {
        Room room = closedRoom();
        Membership owner =
                owner("owner-1", MembershipStatus.LEFT, 0);

        assertFailure(
                () -> RoomMembershipTransitions.closeRoom(
                        room,
                        owner,
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.NOT_ROOM_OWNER);
        assertFailure(
                () -> RoomMembershipTransitions.closeRoom(
                        room,
                        owner("someone-else", MembershipStatus.LEFT, 0),
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
    }

    private Room activeRoom(
            String ownerUserId,
            int activeMemberCount,
            long version
    ) {
        return Room.restore(
                "room-1",
                "room-1",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                ownerUserId,
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                activeMemberCount,
                CREATED_AT,
                null,
                version);
    }

    private Room closedRoom() {
        return Room.restore(
                "room-1",
                "room-1",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "owner-1",
                RoomStatus.CLOSED,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                0,
                CREATED_AT,
                CREATED_AT.plusSeconds(30),
                8);
    }

    private Membership owner(
            String userId,
            MembershipStatus status,
            long version
    ) {
        return Membership.restore(
                "membership-" + userId,
                "room-1",
                userId,
                MembershipRole.OWNER,
                status,
                CREATED_AT,
                status == MembershipStatus.LEFT
                        ? CREATED_AT.plusSeconds(30) : null,
                null,
                10,
                version);
    }

    private Membership member(
            String userId,
            MembershipStatus status,
            long version
    ) {
        return Membership.restore(
                "membership-" + userId,
                "room-1",
                userId,
                MembershipRole.MEMBER,
                status,
                CREATED_AT,
                status == MembershipStatus.LEFT
                        ? CREATED_AT.plusSeconds(20) : null,
                status == MembershipStatus.BANNED
                        ? CREATED_AT.plusSeconds(20) : null,
                10,
                version);
    }

    private void assertTimesUnchanged(
            Membership before,
            Membership after
    ) {
        assertThat(after.joinedAt()).isEqualTo(before.joinedAt());
        assertThat(after.leftAt()).isEqualTo(before.leftAt());
        assertThat(after.bannedAt()).isEqualTo(before.bannedAt());
    }

    private void assertFailure(
            Runnable operation,
            RoomDomainErrorCode code
    ) {
        assertThatThrownBy(operation::run)
                .isInstanceOf(RoomDomainException.class)
                .extracting(exception ->
                        ((RoomDomainException) exception).code())
                .isEqualTo(code);
    }
}
