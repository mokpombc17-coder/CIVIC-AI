package com.hamcheeze.chat.room;

import java.time.Instant;
import java.util.Objects;

public final class Membership {

    private final String membershipId;
    private final String roomId;
    private final String userId;
    private final MembershipRole role;
    private final MembershipStatus status;
    private final Instant joinedAt;
    private final Instant leftAt;
    private final Instant bannedAt;
    private final long messageVisibleAfterSequence;
    private final long version;

    private Membership(
            String membershipId,
            String roomId,
            String userId,
            MembershipRole role,
            MembershipStatus status,
            Instant joinedAt,
            Instant leftAt,
            Instant bannedAt,
            long messageVisibleAfterSequence,
            long version
    ) {
        this.membershipId =
                RoomDomainValidation.requireMembershipId(membershipId);
        this.roomId = RoomDomainValidation.requireRoomId(roomId);
        this.userId = RoomDomainValidation.requireUserId(userId);
        this.role = RoomDomainValidation.requireStateValue(role);
        this.status = RoomDomainValidation.requireStateValue(status);
        this.joinedAt =
                RoomDomainValidation.requireStateTime(joinedAt);
        this.messageVisibleAfterSequence =
                RoomDomainValidation.requireMessageVisibleAfterSequence(
                        messageVisibleAfterSequence);
        this.version = RoomDomainValidation.requireVersion(version);
        validateState(role, status, joinedAt, leftAt, bannedAt);
        this.leftAt = leftAt;
        this.bannedAt = bannedAt;
    }

    public static Membership restore(
            String membershipId,
            String roomId,
            String userId,
            MembershipRole role,
            MembershipStatus status,
            Instant joinedAt,
            Instant leftAt,
            Instant bannedAt,
            long messageVisibleAfterSequence,
            long version
    ) {
        return new Membership(
                membershipId,
                roomId,
                userId,
                role,
                status,
                joinedAt,
                leftAt,
                bannedAt,
                messageVisibleAfterSequence,
                version);
    }

    static Membership createOwner(
            String membershipId,
            String roomId,
            String userId,
            Instant joinedAt
    ) {
        return createActive(
                membershipId,
                roomId,
                userId,
                MembershipRole.OWNER,
                joinedAt,
                0);
    }

    static Membership createMember(
            String membershipId,
            String roomId,
            String userId,
            Instant joinedAt,
            long messageVisibleAfterSequence
    ) {
        return createActive(
                membershipId,
                roomId,
                userId,
                MembershipRole.MEMBER,
                joinedAt,
                messageVisibleAfterSequence);
    }

    private static Membership createActive(
            String membershipId,
            String roomId,
            String userId,
            MembershipRole role,
            Instant joinedAt,
            long messageVisibleAfterSequence
    ) {
        Instant transitionTime =
                RoomDomainValidation.requireTransitionTime(joinedAt);
        return new Membership(
                membershipId,
                roomId,
                userId,
                role,
                MembershipStatus.ACTIVE,
                transitionTime,
                null,
                null,
                messageVisibleAfterSequence,
                0);
    }

    Membership reactivateAt(
            Instant transitionTime,
            long messageVisibleAfterSequence
    ) {
        if (status != MembershipStatus.LEFT) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        Instant joined =
                RoomDomainValidation.requireTransitionTime(transitionTime);
        RoomDomainValidation.requireNotBefore(joined, leftAt);
        return copy(
                role,
                MembershipStatus.ACTIVE,
                joined,
                null,
                null,
                messageVisibleAfterSequence);
    }

    Membership leaveAt(Instant transitionTime) {
        if (status != MembershipStatus.ACTIVE) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        Instant left =
                RoomDomainValidation.requireTransitionTime(transitionTime);
        RoomDomainValidation.requireNotBefore(left, joinedAt);
        return copy(
                role,
                MembershipStatus.LEFT,
                joinedAt,
                left,
                null,
                messageVisibleAfterSequence);
    }

    Membership banAt(Instant transitionTime) {
        if (status != MembershipStatus.ACTIVE
                && status != MembershipStatus.LEFT) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        Instant banned =
                RoomDomainValidation.requireTransitionTime(transitionTime);
        RoomDomainValidation.requireNotBefore(banned, joinedAt);
        if (leftAt != null) {
            RoomDomainValidation.requireNotBefore(banned, leftAt);
        }
        return copy(
                role,
                MembershipStatus.BANNED,
                joinedAt,
                null,
                banned,
                messageVisibleAfterSequence);
    }

    Membership unbanAt(Instant transitionTime) {
        if (status != MembershipStatus.BANNED) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        Instant left =
                RoomDomainValidation.requireTransitionTime(transitionTime);
        RoomDomainValidation.requireNotBefore(left, bannedAt);
        return copy(
                role,
                MembershipStatus.LEFT,
                joinedAt,
                left,
                null,
                messageVisibleAfterSequence);
    }

    Membership promoteToOwner() {
        if (role != MembershipRole.MEMBER
                || status != MembershipStatus.ACTIVE) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        return copy(
                MembershipRole.OWNER,
                status,
                joinedAt,
                leftAt,
                bannedAt,
                messageVisibleAfterSequence);
    }

    Membership demoteToMember() {
        if (role != MembershipRole.OWNER
                || status != MembershipStatus.ACTIVE) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        return copy(
                MembershipRole.MEMBER,
                status,
                joinedAt,
                leftAt,
                bannedAt,
                messageVisibleAfterSequence);
    }

    private Membership copy(
            MembershipRole nextRole,
            MembershipStatus nextStatus,
            Instant nextJoinedAt,
            Instant nextLeftAt,
            Instant nextBannedAt,
            long nextMessageVisibleAfterSequence
    ) {
        return new Membership(
                membershipId,
                roomId,
                userId,
                nextRole,
                nextStatus,
                nextJoinedAt,
                nextLeftAt,
                nextBannedAt,
                nextMessageVisibleAfterSequence,
                RoomDomainValidation.nextVersion(version));
    }

    private static void validateState(
            MembershipRole role,
            MembershipStatus status,
            Instant joinedAt,
            Instant leftAt,
            Instant bannedAt
    ) {
        if (role == MembershipRole.OWNER
                && status == MembershipStatus.BANNED) {
            invalidState();
        }
        switch (status) {
            case ACTIVE -> {
                if (leftAt != null || bannedAt != null) {
                    invalidState();
                }
            }
            case LEFT -> {
                if (leftAt == null || bannedAt != null
                        || leftAt.isBefore(joinedAt)) {
                    invalidState();
                }
            }
            case BANNED -> {
                if (leftAt != null || bannedAt == null
                        || bannedAt.isBefore(joinedAt)) {
                    invalidState();
                }
            }
        }
    }

    private static void invalidState() {
        throw new RoomDomainException(
                RoomDomainErrorCode.INVALID_DOMAIN_STATE);
    }

    public String membershipId() {
        return membershipId;
    }

    public String roomId() {
        return roomId;
    }

    public String userId() {
        return userId;
    }

    public MembershipRole role() {
        return role;
    }

    public MembershipStatus status() {
        return status;
    }

    public Instant joinedAt() {
        return joinedAt;
    }

    public Instant leftAt() {
        return leftAt;
    }

    public Instant bannedAt() {
        return bannedAt;
    }

    public long messageVisibleAfterSequence() {
        return messageVisibleAfterSequence;
    }

    public long version() {
        return version;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Membership membership)) {
            return false;
        }
        return messageVisibleAfterSequence
                == membership.messageVisibleAfterSequence
                && version == membership.version
                && membershipId.equals(membership.membershipId)
                && roomId.equals(membership.roomId)
                && userId.equals(membership.userId)
                && role == membership.role
                && status == membership.status
                && joinedAt.equals(membership.joinedAt)
                && Objects.equals(leftAt, membership.leftAt)
                && Objects.equals(bannedAt, membership.bannedAt);
    }

    @Override
    public int hashCode() {
        return Objects.hash(
                membershipId,
                roomId,
                userId,
                role,
                status,
                joinedAt,
                leftAt,
                bannedAt,
                messageVisibleAfterSequence,
                version);
    }

    @Override
    public String toString() {
        return "Membership[membershipId=" + membershipId
                + ", roomId=" + roomId
                + ", userId=" + userId
                + ", role=" + role
                + ", status=" + status
                + ", joinedAt=" + joinedAt
                + ", leftAt=" + leftAt
                + ", bannedAt=" + bannedAt
                + ", messageVisibleAfterSequence="
                + messageVisibleAfterSequence
                + ", version=" + version
                + ']';
    }
}
