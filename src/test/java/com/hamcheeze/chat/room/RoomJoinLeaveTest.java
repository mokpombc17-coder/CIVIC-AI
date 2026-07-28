package com.hamcheeze.chat.room;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomJoinLeaveTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-28T00:00:00Z");
    private static final Instant TRANSITION_AT =
            CREATED_AT.plusSeconds(60);

    @Test
    void joinsNewMemberAndIncrementsRoomState() {
        Room room = activeRoom(1, 3, JoinPolicy.OPEN);

        JoinRoomTransition result =
                RoomMembershipTransitions.joinRoom(
                        room,
                        null,
                        "membership-2",
                        "user-2",
                        TRANSITION_AT);

        assertThat(result.outcome())
                .isEqualTo(JoinRoomTransition.Outcome.JOINED);
        assertThat(result.membershipCreated()).isTrue();
        assertThat(result.room().activeMemberCount()).isEqualTo(2);
        assertThat(result.room().version()).isEqualTo(4);
        assertThat(result.membership().membershipId())
                .isEqualTo("membership-2");
        assertThat(result.membership().role())
                .isEqualTo(MembershipRole.MEMBER);
        assertThat(result.membership().status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(result.membership().joinedAt())
                .isEqualTo(TRANSITION_AT);
        assertThat(result.membership().version()).isZero();
    }

    @Test
    void activeJoinIsBusinessNoOp() {
        Room room = activeRoom(2, 7, JoinPolicy.OPEN);
        Membership membership = activeMember("user-2", 4);

        JoinRoomTransition result =
                RoomMembershipTransitions.joinRoom(
                        room,
                        membership,
                        null,
                        "user-2",
                        TRANSITION_AT);

        assertThat(result.outcome())
                .isEqualTo(
                        JoinRoomTransition.Outcome.ALREADY_ACTIVE);
        assertThat(result.membershipCreated()).isFalse();
        assertThat(result.room()).isSameAs(room);
        assertThat(result.membership()).isSameAs(membership);
        assertThat(result.room().activeMemberCount()).isEqualTo(2);
        assertThat(result.room().version()).isEqualTo(7);
        assertThat(result.membership().version()).isEqualTo(4);
        assertThat(result.membership().joinedAt())
                .isEqualTo(CREATED_AT);
    }

    @Test
    void rejoinsLeftMemberAndResetsMembershipTimes() {
        Room room = activeRoom(1, 2, JoinPolicy.OPEN);
        Membership left = leftMember("user-2", 5);

        JoinRoomTransition result =
                RoomMembershipTransitions.joinRoom(
                        room,
                        left,
                        null,
                        "user-2",
                        TRANSITION_AT);

        assertThat(result.outcome())
                .isEqualTo(JoinRoomTransition.Outcome.REJOINED);
        assertThat(result.membershipCreated()).isFalse();
        assertThat(result.room().activeMemberCount()).isEqualTo(2);
        assertThat(result.room().version()).isEqualTo(3);
        assertThat(result.membership().status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(result.membership().joinedAt())
                .isEqualTo(TRANSITION_AT);
        assertThat(result.membership().leftAt()).isNull();
        assertThat(result.membership().bannedAt()).isNull();
        assertThat(result.membership().version()).isEqualTo(6);
    }

    @Test
    void rejectsBannedMemberJoin() {
        assertFailure(
                () -> RoomMembershipTransitions.joinRoom(
                        activeRoom(1, 0, JoinPolicy.OPEN),
                        bannedMember("user-2", 1),
                        null,
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.MEMBERSHIP_BANNED);
    }

    @Test
    void rejectsClosedAndInviteOnlyRoomJoin() {
        assertFailure(
                () -> RoomMembershipTransitions.joinRoom(
                        closedRoom(),
                        null,
                        "membership-2",
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.ROOM_CLOSED);
        assertFailure(
                () -> RoomMembershipTransitions.joinRoom(
                        activeRoom(1, 0, JoinPolicy.INVITE_ONLY),
                        null,
                        "membership-2",
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.JOIN_POLICY_NOT_OPEN);
    }

    @Test
    void rejectsMismatchedExistingMembershipOnJoin() {
        Membership otherRoom = Membership.restore(
                "membership-2",
                "room-2",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                CREATED_AT,
                null,
                null,
                0);
        Membership otherUser = activeMember("user-3", 0);

        assertFailure(
                () -> RoomMembershipTransitions.joinRoom(
                        activeRoom(1, 0, JoinPolicy.OPEN),
                        otherRoom,
                        null,
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.MEMBERSHIP_ROOM_MISMATCH);
        assertFailure(
                () -> RoomMembershipTransitions.joinRoom(
                        activeRoom(1, 0, JoinPolicy.OPEN),
                        otherUser,
                        null,
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.MEMBERSHIP_USER_MISMATCH);
    }

    @Test
    void joinCannotCreateOrRestoreAnInvalidOwnerMembership() {
        Room room = activeRoom(1, 0, JoinPolicy.OPEN);
        Membership foreignOwner = Membership.restore(
                "membership-user-2",
                "room-1",
                "user-2",
                MembershipRole.OWNER,
                MembershipStatus.ACTIVE,
                CREATED_AT,
                null,
                null,
                0);

        assertFailure(
                () -> RoomMembershipTransitions.joinRoom(
                        room,
                        null,
                        "membership-owner-duplicate",
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
        assertFailure(
                () -> RoomMembershipTransitions.joinRoom(
                        room,
                        foreignOwner,
                        null,
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_MEMBERSHIP_MISMATCH);
    }

    @Test
    void activeMemberLeavesAndDecrementsRoomState() {
        Room room = activeRoom(2, 3, JoinPolicy.OPEN);
        Membership member = activeMember("user-2", 5);

        LeaveRoomTransition result =
                RoomMembershipTransitions.leaveRoom(
                        room,
                        member,
                        "user-2",
                        TRANSITION_AT);

        assertThat(result.outcome())
                .isEqualTo(LeaveRoomTransition.Outcome.LEFT);
        assertThat(result.room().activeMemberCount()).isEqualTo(1);
        assertThat(result.room().version()).isEqualTo(4);
        assertThat(result.membership().status())
                .isEqualTo(MembershipStatus.LEFT);
        assertThat(result.membership().leftAt())
                .isEqualTo(TRANSITION_AT);
        assertThat(result.membership().bannedAt()).isNull();
        assertThat(result.membership().version()).isEqualTo(6);
    }

    @Test
    void leftMemberLeaveIsBusinessNoOp() {
        Room room = activeRoom(1, 7, JoinPolicy.OPEN);
        Membership membership = leftMember("user-2", 4);

        LeaveRoomTransition result =
                RoomMembershipTransitions.leaveRoom(
                        room,
                        membership,
                        "user-2",
                        TRANSITION_AT);

        assertThat(result.outcome())
                .isEqualTo(
                        LeaveRoomTransition.Outcome.ALREADY_LEFT);
        assertThat(result.room()).isSameAs(room);
        assertThat(result.membership()).isSameAs(membership);
        assertThat(result.room().activeMemberCount()).isEqualTo(1);
        assertThat(result.room().version()).isEqualTo(7);
        assertThat(result.membership().version()).isEqualTo(4);
        assertThat(result.membership().leftAt())
                .isEqualTo(CREATED_AT.plusSeconds(20));
    }

    @Test
    void rejectsOwnerAndBannedMemberLeave() {
        assertFailure(
                () -> RoomMembershipTransitions.leaveRoom(
                        activeRoom(1, 0, JoinPolicy.OPEN),
                        ownerMembership(MembershipStatus.ACTIVE),
                        "owner-1",
                        TRANSITION_AT),
                RoomDomainErrorCode.OWNER_CANNOT_LEAVE);
        assertFailure(
                () -> RoomMembershipTransitions.leaveRoom(
                        activeRoom(1, 0, JoinPolicy.OPEN),
                        bannedMember("user-2", 0),
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.MEMBERSHIP_BANNED);
    }

    @Test
    void rejectsLeaveFromClosedRoom() {
        assertFailure(
                () -> RoomMembershipTransitions.leaveRoom(
                        closedRoom(),
                        leftMember("user-2", 0),
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.ROOM_CLOSED);
    }

    @Test
    void rejectsMismatchedMemberOnLeave() {
        Membership otherRoom = Membership.restore(
                "membership-user-2",
                "room-2",
                "user-2",
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                CREATED_AT,
                null,
                null,
                0);

        assertFailure(
                () -> RoomMembershipTransitions.leaveRoom(
                        activeRoom(2, 0, JoinPolicy.OPEN),
                        otherRoom,
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode.MEMBERSHIP_ROOM_MISMATCH);
        assertFailure(
                () -> RoomMembershipTransitions.leaveRoom(
                        activeRoom(2, 0, JoinPolicy.OPEN),
                        activeMember("user-2", 0),
                        "user-3",
                        TRANSITION_AT),
                RoomDomainErrorCode.MEMBERSHIP_USER_MISMATCH);
    }

    @Test
    void leaveCannotReduceActiveMemberCountBelowOwner() {
        Room room = activeRoom(1, 4, JoinPolicy.OPEN);
        Membership member = activeMember("user-2", 2);

        assertFailure(
                () -> RoomMembershipTransitions.leaveRoom(
                        room,
                        member,
                        "user-2",
                        TRANSITION_AT),
                RoomDomainErrorCode
                        .ACTIVE_MEMBER_COUNT_INVARIANT_VIOLATION);
        assertThat(room.activeMemberCount()).isEqualTo(1);
        assertThat(room.version()).isEqualTo(4);
        assertThat(member.status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(member.version()).isEqualTo(2);
    }

    private Room activeRoom(
            int activeMemberCount,
            long version,
            JoinPolicy joinPolicy
    ) {
        return Room.restore(
                "room-1",
                "owner-1",
                RoomStatus.ACTIVE,
                RoomVisibility.LISTED,
                joinPolicy,
                activeMemberCount,
                CREATED_AT,
                null,
                version);
    }

    private Room closedRoom() {
        return Room.restore(
                "room-1",
                "owner-1",
                RoomStatus.CLOSED,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                0,
                CREATED_AT,
                CREATED_AT.plusSeconds(30),
                1);
    }

    private Membership activeMember(String userId, long version) {
        return Membership.restore(
                "membership-" + userId,
                "room-1",
                userId,
                MembershipRole.MEMBER,
                MembershipStatus.ACTIVE,
                CREATED_AT,
                null,
                null,
                version);
    }

    private Membership leftMember(String userId, long version) {
        return Membership.restore(
                "membership-" + userId,
                "room-1",
                userId,
                MembershipRole.MEMBER,
                MembershipStatus.LEFT,
                CREATED_AT,
                CREATED_AT.plusSeconds(20),
                null,
                version);
    }

    private Membership bannedMember(String userId, long version) {
        return Membership.restore(
                "membership-" + userId,
                "room-1",
                userId,
                MembershipRole.MEMBER,
                MembershipStatus.BANNED,
                CREATED_AT,
                null,
                CREATED_AT.plusSeconds(20),
                version);
    }

    private Membership ownerMembership(MembershipStatus status) {
        return Membership.restore(
                "membership-owner",
                "room-1",
                "owner-1",
                MembershipRole.OWNER,
                status,
                CREATED_AT,
                status == MembershipStatus.LEFT
                        ? CREATED_AT.plusSeconds(20) : null,
                null,
                0);
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
