package com.hamcheeze.chat.room;

import java.time.Instant;
import java.util.Objects;

public final class Room {

    public static final int MAX_NAME_LENGTH = 100;

    private final String roomId;
    private final String name;
    private final String ownerUserId;
    private final RoomStatus status;
    private final RoomVisibility visibility;
    private final JoinPolicy joinPolicy;
    private final int activeMemberCount;
    private final Instant createdAt;
    private final Instant closedAt;
    private final long version;

    private Room(
            String roomId,
            String name,
            String ownerUserId,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            int activeMemberCount,
            Instant createdAt,
            Instant closedAt,
            long version
    ) {
        this.roomId = RoomDomainValidation.requireRoomId(roomId);
        this.name = RoomDomainValidation.requireRoomName(name);
        this.ownerUserId =
                RoomDomainValidation.requireUserId(ownerUserId);
        this.status = RoomDomainValidation.requireStateValue(status);
        this.visibility =
                RoomDomainValidation.requireStateValue(visibility);
        this.joinPolicy =
                RoomDomainValidation.requireStateValue(joinPolicy);
        this.createdAt =
                RoomDomainValidation.requireStateTime(createdAt);
        this.version = RoomDomainValidation.requireVersion(version);
        validateState(
                status,
                activeMemberCount,
                createdAt,
                closedAt);
        this.activeMemberCount = activeMemberCount;
        this.closedAt = closedAt;
    }

    public static Room restore(
            String roomId,
            String name,
            String ownerUserId,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            int activeMemberCount,
            Instant createdAt,
            Instant closedAt,
            long version
    ) {
        return new Room(
                roomId,
                name,
                ownerUserId,
                status,
                visibility,
                joinPolicy,
                activeMemberCount,
                createdAt,
                closedAt,
                version);
    }

    public static Room restore(
            String roomId,
            String ownerUserId,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            int activeMemberCount,
            Instant createdAt,
            Instant closedAt,
            long version
    ) {
        return restore(
                roomId,
                roomId,
                ownerUserId,
                status,
                visibility,
                joinPolicy,
                activeMemberCount,
                createdAt,
                closedAt,
                version);
    }

    static Room create(
            String roomId,
            String name,
            String ownerUserId,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            Instant createdAt
    ) {
        return new Room(
                roomId,
                name,
                ownerUserId,
                RoomStatus.ACTIVE,
                visibility,
                joinPolicy,
                1,
                createdAt,
                null,
                0);
    }

    Room memberJoined() {
        if (activeMemberCount == Integer.MAX_VALUE) {
            throw new RoomDomainException(
                    RoomDomainErrorCode
                            .ACTIVE_MEMBER_COUNT_INVARIANT_VIOLATION);
        }
        return copy(
                ownerUserId,
                status,
                activeMemberCount + 1,
                closedAt,
                RoomDomainValidation.nextVersion(version));
    }

    Room memberLeft() {
        if (activeMemberCount <= 1) {
            throw new RoomDomainException(
                    RoomDomainErrorCode
                            .ACTIVE_MEMBER_COUNT_INVARIANT_VIOLATION);
        }
        return copy(
                ownerUserId,
                status,
                activeMemberCount - 1,
                closedAt,
                RoomDomainValidation.nextVersion(version));
    }

    Room memberStateChangedWithoutCountChange() {
        return copy(
                ownerUserId,
                status,
                activeMemberCount,
                closedAt,
                RoomDomainValidation.nextVersion(version));
    }

    Room transferOwnershipTo(String newOwnerUserId) {
        return copy(
                RoomDomainValidation.requireUserId(newOwnerUserId),
                status,
                activeMemberCount,
                closedAt,
                RoomDomainValidation.nextVersion(version));
    }

    Room closeAt(Instant transitionTime) {
        Instant closed =
                RoomDomainValidation.requireTransitionTime(transitionTime);
        RoomDomainValidation.requireNotBefore(closed, createdAt);
        return copy(
                ownerUserId,
                RoomStatus.CLOSED,
                0,
                closed,
                RoomDomainValidation.nextVersion(version));
    }

    private Room copy(
            String nextOwnerUserId,
            RoomStatus nextStatus,
            int nextActiveMemberCount,
            Instant nextClosedAt,
            long nextVersion
    ) {
        return new Room(
                roomId,
                name,
                nextOwnerUserId,
                nextStatus,
                visibility,
                joinPolicy,
                nextActiveMemberCount,
                createdAt,
                nextClosedAt,
                nextVersion);
    }

    private static void validateState(
            RoomStatus status,
            int activeMemberCount,
            Instant createdAt,
            Instant closedAt
    ) {
        if (status == RoomStatus.ACTIVE) {
            if (activeMemberCount < 1) {
                throw new RoomDomainException(
                        RoomDomainErrorCode
                                .ACTIVE_MEMBER_COUNT_INVARIANT_VIOLATION);
            }
            if (closedAt != null) {
                throw new RoomDomainException(
                        RoomDomainErrorCode.INVALID_DOMAIN_STATE);
            }
            return;
        }
        if (activeMemberCount != 0 || closedAt == null) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
        if (closedAt.isBefore(createdAt)) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.INVALID_DOMAIN_STATE);
        }
    }

    public String roomId() {
        return roomId;
    }

    public String name() {
        return name;
    }

    public String ownerUserId() {
        return ownerUserId;
    }

    public RoomStatus status() {
        return status;
    }

    public RoomVisibility visibility() {
        return visibility;
    }

    public JoinPolicy joinPolicy() {
        return joinPolicy;
    }

    public int activeMemberCount() {
        return activeMemberCount;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant closedAt() {
        return closedAt;
    }

    public long version() {
        return version;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Room room)) {
            return false;
        }
        return activeMemberCount == room.activeMemberCount
                && version == room.version
                && roomId.equals(room.roomId)
                && name.equals(room.name)
                && ownerUserId.equals(room.ownerUserId)
                && status == room.status
                && visibility == room.visibility
                && joinPolicy == room.joinPolicy
                && createdAt.equals(room.createdAt)
                && Objects.equals(closedAt, room.closedAt);
    }

    @Override
    public int hashCode() {
        return Objects.hash(
                roomId,
                name,
                ownerUserId,
                status,
                visibility,
                joinPolicy,
                activeMemberCount,
                createdAt,
                closedAt,
                version);
    }

    @Override
    public String toString() {
        return "Room[roomId=" + roomId
                + ", name=" + name
                + ", ownerUserId=" + ownerUserId
                + ", status=" + status
                + ", visibility=" + visibility
                + ", joinPolicy=" + joinPolicy
                + ", activeMemberCount=" + activeMemberCount
                + ", createdAt=" + createdAt
                + ", closedAt=" + closedAt
                + ", version=" + version
                + ']';
    }
}
