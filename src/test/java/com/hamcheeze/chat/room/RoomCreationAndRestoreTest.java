package com.hamcheeze.chat.room;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomCreationAndRestoreTest {

    private static final Instant CREATED_AT =
            Instant.parse("2026-07-28T00:00:00Z");

    @Test
    void createsRoomAndOwnerMembershipTogether() {
        RoomCreationResult result =
                RoomMembershipTransitions.createRoom(
                        "room-1",
                        "  Test room  ",
                "",
                java.util.List.of(
                        RoomCategory.POLICY),
                        "membership-owner",
                        "owner-1",
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN,
                        CREATED_AT);

        assertThat(result.outcome())
                .isEqualTo(RoomCreationResult.Outcome.CREATED);
        assertThat(result.room().roomId()).isEqualTo("room-1");
        assertThat(result.room().name()).isEqualTo("Test room");
        assertThat(result.room().categories())
                .containsExactly(RoomCategory.POLICY);
        assertThat(result.room().ownerUserId())
                .isEqualTo("owner-1");
        assertThat(result.room().status())
                .isEqualTo(RoomStatus.ACTIVE);
        assertThat(result.room().activeMemberCount()).isEqualTo(1);
        assertThat(result.room().createdAt()).isEqualTo(CREATED_AT);
        assertThat(result.room().closedAt()).isNull();
        assertThat(result.room().version()).isZero();

        Membership owner = result.ownerMembership();
        assertThat(owner.membershipId())
                .isEqualTo("membership-owner");
        assertThat(owner.roomId()).isEqualTo(result.room().roomId());
        assertThat(owner.userId())
                .isEqualTo(result.room().ownerUserId());
        assertThat(owner.role()).isEqualTo(MembershipRole.OWNER);
        assertThat(owner.status()).isEqualTo(MembershipStatus.ACTIVE);
        assertThat(owner.joinedAt()).isEqualTo(CREATED_AT);
        assertThat(owner.leftAt()).isNull();
        assertThat(owner.bannedAt()).isNull();
        assertThat(owner.messageVisibleAfterSequence()).isZero();
        assertThat(owner.version()).isZero();
    }

    @Test
    void categoriesAreRequiredAndCurrentlyLimitedToOne() {
        assertThatThrownBy(() -> RoomCategories.requireValid(List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RoomCategories.requireValid(List.of(
                RoomCategory.POLICY,
                RoomCategory.ENVIRONMENT)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RoomCategories.requireValid(List.of(
                RoomCategory.POLICY,
                RoomCategory.POLICY)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(RoomCategories.requireValid(List.of(
                RoomCategory.LOCAL_ISSUE)))
                .containsExactly(RoomCategory.LOCAL_ISSUE);
    }

    @Test
    void rejectsInvalidRoomIdWhenCreatingRoom() {
        assertFailure(
                () -> create("room with spaces", "owner", "owner-1",
                        RoomVisibility.LISTED, JoinPolicy.OPEN,
                        CREATED_AT),
                RoomDomainErrorCode.INVALID_ROOM_ID);
        assertFailure(
                () -> create("", "owner", "owner-1",
                        RoomVisibility.LISTED, JoinPolicy.OPEN,
                        CREATED_AT),
                RoomDomainErrorCode.INVALID_ROOM_ID);
        assertFailure(
                () -> create("a".repeat(65), "owner", "owner-1",
                        RoomVisibility.LISTED, JoinPolicy.OPEN,
                        CREATED_AT),
                RoomDomainErrorCode.INVALID_ROOM_ID);
    }

    @Test
    void rejectsInvalidRoomName() {
        assertFailure(
                () -> RoomMembershipTransitions.createRoom(
                        "room-1",
                        " ",
                "",
                java.util.List.of(
                        RoomCategory.POLICY),
                        "owner",
                        "owner-1",
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN,
                        CREATED_AT),
                RoomDomainErrorCode.INVALID_ROOM_NAME);
        assertFailure(
                () -> RoomMembershipTransitions.createRoom(
                        "room-1",
                        "a".repeat(Room.MAX_NAME_LENGTH + 1),
                "",
                java.util.List.of(
                        RoomCategory.POLICY),
                        "owner",
                        "owner-1",
                        RoomVisibility.LISTED,
                        JoinPolicy.OPEN,
                        CREATED_AT),
                RoomDomainErrorCode.INVALID_ROOM_NAME);
    }

    @Test
    void rejectsInvalidOwnerAndOwnerMembershipIds() {
        assertFailure(
                () -> create("room-1", " ", "owner-1",
                        RoomVisibility.LISTED, JoinPolicy.OPEN,
                        CREATED_AT),
                RoomDomainErrorCode.INVALID_MEMBERSHIP_ID);
        assertFailure(
                () -> create("room-1", "owner", " ",
                        RoomVisibility.LISTED, JoinPolicy.OPEN,
                        CREATED_AT),
                RoomDomainErrorCode.INVALID_USER_ID);
    }

    @Test
    void rejectsMissingCreationValues() {
        assertFailure(
                () -> create("room-1", "owner", "owner-1",
                        null, JoinPolicy.OPEN, CREATED_AT),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> create("room-1", "owner", "owner-1",
                        RoomVisibility.LISTED, null, CREATED_AT),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> create("room-1", "owner", "owner-1",
                        RoomVisibility.LISTED, JoinPolicy.OPEN, null),
                RoomDomainErrorCode.INVALID_TRANSITION_TIME);
    }

    @Test
    void restoresValidActiveAndClosedRooms() {
        Room active = room(
                RoomStatus.ACTIVE, 2, null, 4);
        Room activeAboveCurrentDefaultLimit = room(
                RoomStatus.ACTIVE, 70, null, 6);
        Room closed = room(
                RoomStatus.CLOSED, 0,
                CREATED_AT.plusSeconds(60), 5);

        assertThat(active.status()).isEqualTo(RoomStatus.ACTIVE);
        assertThat(active.name()).isEqualTo("room-1");
        assertThat(active.activeMemberCount()).isEqualTo(2);
        assertThat(active.version()).isEqualTo(4);
        assertThat(activeAboveCurrentDefaultLimit.activeMemberCount())
                .isEqualTo(70);
        assertThat(activeAboveCurrentDefaultLimit.version())
                .isEqualTo(6);
        assertThat(closed.status()).isEqualTo(RoomStatus.CLOSED);
        assertThat(closed.closedAt())
                .isEqualTo(CREATED_AT.plusSeconds(60));
        assertThat(closed.version()).isEqualTo(5);
    }

    @Test
    void rejectsInvalidRestoredRoomState() {
        assertFailure(
                () -> room(RoomStatus.ACTIVE, 1,
                        CREATED_AT.plusSeconds(1), 0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> room(RoomStatus.CLOSED, 0, null, 0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> room(RoomStatus.CLOSED, 1,
                        CREATED_AT.plusSeconds(1), 0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> room(RoomStatus.ACTIVE, 0, null, 0),
                RoomDomainErrorCode
                        .ACTIVE_MEMBER_COUNT_INVARIANT_VIOLATION);
        assertFailure(
                () -> room(RoomStatus.ACTIVE, 1, null, -1),
                RoomDomainErrorCode.INVALID_VERSION);
        assertFailure(
                () -> room(RoomStatus.CLOSED, 0,
                        CREATED_AT.minusSeconds(1), 0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
    }

    @Test
    void restoresValidMembershipStates() {
        Membership active = membership(
                MembershipStatus.ACTIVE,
                null,
                null,
                1);
        Membership left = membership(
                MembershipStatus.LEFT,
                CREATED_AT.plusSeconds(10),
                null,
                2);
        Membership banned = membership(
                MembershipStatus.BANNED,
                null,
                CREATED_AT.plusSeconds(20),
                3);
        Membership activeOwner = Membership.restore(
                "membership-owner-active",
                "room-1",
                "owner-1",
                MembershipRole.OWNER,
                MembershipStatus.ACTIVE,
                CREATED_AT,
                null,
                null,
                10,
                4);
        Membership leftOwner = Membership.restore(
                "membership-owner-left",
                "room-1",
                "owner-1",
                MembershipRole.OWNER,
                MembershipStatus.LEFT,
                CREATED_AT,
                CREATED_AT.plusSeconds(30),
                null,
                11,
                5);

        assertThat(active.status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(left.leftAt())
                .isEqualTo(CREATED_AT.plusSeconds(10));
        assertThat(banned.bannedAt())
                .isEqualTo(CREATED_AT.plusSeconds(20));
        assertThat(activeOwner.role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(activeOwner.status())
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(leftOwner.role())
                .isEqualTo(MembershipRole.OWNER);
        assertThat(leftOwner.status())
                .isEqualTo(MembershipStatus.LEFT);
    }

    @Test
    void rejectsOwnerBannedMembershipRestore() {
        assertFailure(
                () -> Membership.restore(
                        "membership-owner",
                        "room-1",
                        "owner-1",
                        MembershipRole.OWNER,
                        MembershipStatus.BANNED,
                        CREATED_AT,
                        null,
                        CREATED_AT.plusSeconds(20),
                        0,
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
    }

    @Test
    void rejectsInvalidActiveMembershipTimes() {
        assertFailure(
                () -> membership(
                        MembershipStatus.ACTIVE,
                        CREATED_AT.plusSeconds(1),
                        null,
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> membership(
                        MembershipStatus.ACTIVE,
                        null,
                        CREATED_AT.plusSeconds(1),
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
    }

    @Test
    void rejectsInvalidLeftMembershipTimes() {
        assertFailure(
                () -> membership(
                        MembershipStatus.LEFT,
                        null,
                        null,
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> membership(
                        MembershipStatus.LEFT,
                        CREATED_AT.plusSeconds(1),
                        CREATED_AT.plusSeconds(2),
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> membership(
                        MembershipStatus.LEFT,
                        CREATED_AT.minusSeconds(1),
                        null,
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
    }

    @Test
    void rejectsInvalidBannedMembershipTimes() {
        assertFailure(
                () -> membership(
                        MembershipStatus.BANNED,
                        null,
                        null,
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> membership(
                        MembershipStatus.BANNED,
                        CREATED_AT.plusSeconds(1),
                        CREATED_AT.plusSeconds(2),
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> membership(
                        MembershipStatus.BANNED,
                        null,
                        CREATED_AT.minusSeconds(1),
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
    }

    @Test
    void rejectsInvalidRestoredMembershipIdentityAndVersion() {
        assertFailure(
                () -> Membership.restore(
                        " ", "room-1", "user-1",
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        CREATED_AT, null, null, 0, 0),
                RoomDomainErrorCode.INVALID_MEMBERSHIP_ID);
        assertFailure(
                () -> Membership.restore(
                        "member-1", "invalid room", "user-1",
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        CREATED_AT, null, null, 0, 0),
                RoomDomainErrorCode.INVALID_ROOM_ID);
        assertFailure(
                () -> Membership.restore(
                        "member-1", "room-1", " ",
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        CREATED_AT, null, null, 0, 0),
                RoomDomainErrorCode.INVALID_USER_ID);
        assertFailure(
                () -> Membership.restore(
                        "member-1", "room-1", "user-1",
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        CREATED_AT, null, null, 0, -1),
                RoomDomainErrorCode.INVALID_VERSION);
    }

    @Test
    void rejectsNegativeMembershipVisibilityBoundaryOnCreateAndRestore() {
        assertFailure(
                () -> Membership.createMember(
                        "membership-1",
                        "room-1",
                        "user-1",
                        CREATED_AT,
                        -1),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        assertFailure(
                () -> Membership.restore(
                        "membership-1",
                        "room-1",
                        "user-1",
                        MembershipRole.MEMBER,
                        MembershipStatus.ACTIVE,
                        CREATED_AT,
                        null,
                        null,
                        -1,
                        0),
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
    }

    @Test
    void visibilityBoundaryParticipatesInMembershipEquality() {
        Membership first = Membership.createMember(
                "membership-1", "room-1", "user-1", CREATED_AT, 10);
        Membership same = Membership.createMember(
                "membership-1", "room-1", "user-1", CREATED_AT, 10);
        Membership differentBoundary = Membership.createMember(
                "membership-1", "room-1", "user-1", CREATED_AT, 11);

        assertThat(first).isEqualTo(same);
        assertThat(first.hashCode()).isEqualTo(same.hashCode());
        assertThat(first).isNotEqualTo(differentBoundary);
    }

    private RoomCreationResult create(
            String roomId,
            String ownerMembershipId,
            String ownerUserId,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            Instant createdAt
    ) {
        return RoomMembershipTransitions.createRoom(
                roomId,
                roomId,
                "",
                java.util.List.of(
                        RoomCategory.POLICY),
                ownerMembershipId,
                ownerUserId,
                visibility,
                joinPolicy,
                createdAt);
    }

    private Room room(
            RoomStatus status,
            int activeMemberCount,
            Instant closedAt,
            long version
    ) {
        return Room.restore(
                "room-1",
                "room-1",
                "",
                java.util.List.of(
                        com.hamcheeze.chat.room.RoomCategory.POLICY),
                "owner-1",
                status,
                RoomVisibility.LISTED,
                JoinPolicy.OPEN,
                activeMemberCount,
                CREATED_AT,
                closedAt,
                version);
    }

    private Membership membership(
            MembershipStatus status,
            Instant leftAt,
            Instant bannedAt,
            long version
    ) {
        return Membership.restore(
                "membership-1",
                "room-1",
                "user-1",
                MembershipRole.MEMBER,
                status,
                CREATED_AT,
                leftAt,
                bannedAt,
                10,
                version);
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
