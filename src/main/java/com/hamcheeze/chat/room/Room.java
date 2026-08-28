package com.hamcheeze.chat.room;

import com.hamcheeze.chat.room.category.LegacyRoomCategoryMapping;
import com.hamcheeze.chat.room.category.RoomCategoryIds;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class Room {

    public static final int MAX_NAME_LENGTH = 100;
    public static final int MAX_DESCRIPTION_CODE_POINTS = 500;

    private final String roomId;
    private final String name;
    private final String description;
    private final List<String> categoryIds;
    private final String ownerMembershipId;
    private final String ownerUserId;
    private final RoomStatus status;
    private final RoomVisibility visibility;
    private final JoinPolicy joinPolicy;
    private final int activeMemberCount;
    private final long nextParticipantNumber;
    private final Instant createdAt;
    private final Instant closedAt;
    private final long version;

    private Room(
            String roomId,
            String name,
            String description,
            List<String> categoryIds,
            String ownerMembershipId,
            String ownerUserId,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            int activeMemberCount,
            long nextParticipantNumber,
            Instant createdAt,
            Instant closedAt,
            long version
    ) {
        this.roomId = RoomDomainValidation.requireRoomId(roomId);
        this.name = RoomDomainValidation.requireRoomName(name);
        this.description =
                RoomDomainValidation.requireRoomDescription(description);
        this.categoryIds = RoomCategoryIds.requireValid(categoryIds);
        this.ownerMembershipId =
                RoomDomainValidation.requireMembershipId(ownerMembershipId);
        this.ownerUserId =
                RoomDomainValidation.requireUserId(ownerUserId);
        this.status = RoomDomainValidation.requireStateValue(status);
        this.visibility =
                RoomDomainValidation.requireStateValue(visibility);
        this.joinPolicy =
                RoomDomainValidation.requireStateValue(joinPolicy);
        this.nextParticipantNumber =
                requireNextParticipantNumber(nextParticipantNumber);
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
            String description,
            List<RoomCategory> categories,
            String ownerMembershipId,
            String ownerUserId,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            int activeMemberCount,
            long nextParticipantNumber,
            Instant createdAt,
            Instant closedAt,
            long version
    ) {
        return new Room(
                roomId,
                name,
                description,
                LegacyRoomCategoryMapping.categoryIds(categories),
                ownerMembershipId,
                ownerUserId,
                status,
                visibility,
                joinPolicy,
                activeMemberCount,
                nextParticipantNumber,
                createdAt,
                closedAt,
                version);
    }

    public static Room restoreWithCategoryIds(
            String roomId,
            String name,
            String description,
            List<String> categoryIds,
            String ownerMembershipId,
            String ownerUserId,
            RoomStatus status,
            RoomVisibility visibility,
            JoinPolicy joinPolicy,
            int activeMemberCount,
            long nextParticipantNumber,
            Instant createdAt,
            Instant closedAt,
            long version
    ) {
        return new Room(
                roomId,
                name,
                description,
                categoryIds,
                ownerMembershipId,
                ownerUserId,
                status,
                visibility,
                joinPolicy,
                activeMemberCount,
                nextParticipantNumber,
                createdAt,
                closedAt,
                version);
    }

    static Room create(
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
        return new Room(
                roomId,
                name,
                description,
                LegacyRoomCategoryMapping.categoryIds(categories),
                ownerMembershipId,
                ownerUserId,
                RoomStatus.ACTIVE,
                visibility,
                joinPolicy,
                1,
                2,
                createdAt,
                null,
                0);
    }

    static Room createWithCategoryIds(
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
        return new Room(
                roomId,
                name,
                description,
                categoryIds,
                ownerMembershipId,
                ownerUserId,
                RoomStatus.ACTIVE,
                visibility,
                joinPolicy,
                1,
                2,
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
        if (nextParticipantNumber == Long.MAX_VALUE) {
            throw new RoomDomainException(
                    RoomDomainErrorCode
                            .PARTICIPANT_NUMBER_INVARIANT_VIOLATION);
        }
        return copy(
                ownerMembershipId,
                ownerUserId,
                status,
                activeMemberCount + 1,
                nextParticipantNumber + 1,
                closedAt,
                RoomDomainValidation.nextVersion(version));
    }

    Room memberRejoined() {
        if (activeMemberCount == Integer.MAX_VALUE) {
            throw new RoomDomainException(
                    RoomDomainErrorCode
                            .ACTIVE_MEMBER_COUNT_INVARIANT_VIOLATION);
        }
        return copy(
                ownerMembershipId,
                ownerUserId,
                status,
                activeMemberCount + 1,
                nextParticipantNumber,
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
                ownerMembershipId,
                ownerUserId,
                status,
                activeMemberCount - 1,
                nextParticipantNumber,
                closedAt,
                RoomDomainValidation.nextVersion(version));
    }

    Room memberStateChangedWithoutCountChange() {
        return copy(
                ownerMembershipId,
                ownerUserId,
                status,
                activeMemberCount,
                nextParticipantNumber,
                closedAt,
                RoomDomainValidation.nextVersion(version));
    }

    Room transferOwnershipTo(
            String newOwnerMembershipId,
            String newOwnerUserId
    ) {
        return copy(
                RoomDomainValidation.requireMembershipId(
                        newOwnerMembershipId),
                RoomDomainValidation.requireUserId(newOwnerUserId),
                status,
                activeMemberCount,
                nextParticipantNumber,
                closedAt,
                RoomDomainValidation.nextVersion(version));
    }

    Room closeAt(Instant transitionTime) {
        Instant closed =
                RoomDomainValidation.requireTransitionTime(transitionTime);
        RoomDomainValidation.requireNotBefore(closed, createdAt);
        return copy(
                ownerMembershipId,
                ownerUserId,
                RoomStatus.CLOSED,
                0,
                nextParticipantNumber,
                closed,
                RoomDomainValidation.nextVersion(version));
    }

    private Room copy(
            String nextOwnerMembershipId,
            String nextOwnerUserId,
            RoomStatus nextStatus,
            int nextActiveMemberCount,
            long nextParticipantNumber,
            Instant nextClosedAt,
            long nextVersion
    ) {
        return new Room(
                roomId,
                name,
                description,
                categoryIds,
                nextOwnerMembershipId,
                nextOwnerUserId,
                nextStatus,
                visibility,
                joinPolicy,
                nextActiveMemberCount,
                nextParticipantNumber,
                createdAt,
                nextClosedAt,
                nextVersion);
    }

    public RoomSettingsUpdateTransition updateSettings(
            String nextName,
            String nextDescription,
            RoomVisibility nextVisibility,
            JoinPolicy nextJoinPolicy
    ) {
        return updateSettingsWithCategoryIds(
                nextName,
                nextDescription,
                categoryIds,
                nextVisibility,
                nextJoinPolicy);
    }

    public RoomSettingsUpdateTransition replaceCategoryIds(
            List<String> nextCategoryIds
    ) {
        List<String> canonicalCategoryIds =
                RoomCategoryIds.requireValid(nextCategoryIds);
        if (categoryIds.equals(canonicalCategoryIds)) {
            return new RoomSettingsUpdateTransition(
                    RoomSettingsUpdateOutcome.UNCHANGED,
                    this);
        }
        return new RoomSettingsUpdateTransition(
                RoomSettingsUpdateOutcome.UPDATED,
                new Room(
                        roomId,
                        name,
                        description,
                        canonicalCategoryIds,
                        ownerMembershipId,
                        ownerUserId,
                        status,
                        visibility,
                        joinPolicy,
                        activeMemberCount,
                        nextParticipantNumber,
                        createdAt,
                        closedAt,
                        RoomDomainValidation.nextVersion(version)));
    }

    private RoomSettingsUpdateTransition updateSettingsWithCategoryIds(
            String nextName,
            String nextDescription,
            List<String> nextCategoryIds,
            RoomVisibility nextVisibility,
            JoinPolicy nextJoinPolicy
    ) {
        if (status != RoomStatus.ACTIVE) {
            throw new RoomDomainException(
                    RoomDomainErrorCode.ROOM_CLOSED);
        }
        String canonicalName =
                RoomDomainValidation.requireRoomName(nextName);
        String canonicalDescription =
                RoomDomainValidation.requireRoomDescription(
                        nextDescription);
        List<String> canonicalCategoryIds =
                RoomCategoryIds.requireValid(nextCategoryIds);
        RoomVisibility canonicalVisibility =
                RoomDomainValidation.requireStateValue(nextVisibility);
        JoinPolicy canonicalJoinPolicy =
                RoomDomainValidation.requireStateValue(nextJoinPolicy);
        if (name.equals(canonicalName)
                && description.equals(canonicalDescription)
                && categoryIds.equals(canonicalCategoryIds)
                && visibility == canonicalVisibility
                && joinPolicy == canonicalJoinPolicy) {
            return new RoomSettingsUpdateTransition(
                    RoomSettingsUpdateOutcome.UNCHANGED,
                    this);
        }
        Room updated = new Room(
                roomId,
                canonicalName,
                canonicalDescription,
                canonicalCategoryIds,
                ownerMembershipId,
                ownerUserId,
                status,
                canonicalVisibility,
                canonicalJoinPolicy,
                activeMemberCount,
                nextParticipantNumber,
                createdAt,
                closedAt,
                RoomDomainValidation.nextVersion(version));
        return new RoomSettingsUpdateTransition(
                RoomSettingsUpdateOutcome.UPDATED,
                updated);
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

    private static long requireNextParticipantNumber(
            long nextParticipantNumber
    ) {
        if (nextParticipantNumber < 2) {
            throw new RoomDomainException(
                    RoomDomainErrorCode
                            .PARTICIPANT_NUMBER_INVARIANT_VIOLATION);
        }
        return nextParticipantNumber;
    }

    public String roomId() {
        return roomId;
    }

    public String name() {
        return name;
    }

    public String description() {
        return description;
    }

    public List<RoomCategory> categories() {
        return LegacyRoomCategoryMapping.legacyCategories(categoryIds);
    }

    public List<String> categoryIds() {
        return categoryIds;
    }

    public String ownerUserId() {
        return ownerUserId;
    }

    public String ownerMembershipId() {
        return ownerMembershipId;
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

    public long nextParticipantNumber() {
        return nextParticipantNumber;
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
                && nextParticipantNumber == room.nextParticipantNumber
                && version == room.version
                && roomId.equals(room.roomId)
                && name.equals(room.name)
                && description.equals(room.description)
                && categoryIds.equals(room.categoryIds)
                && ownerMembershipId.equals(room.ownerMembershipId)
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
                description,
                categoryIds,
                ownerMembershipId,
                ownerUserId,
                status,
                visibility,
                joinPolicy,
                activeMemberCount,
                nextParticipantNumber,
                createdAt,
                closedAt,
                version);
    }

    @Override
    public String toString() {
        return "Room[roomId=" + roomId
                + ", name=" + name
                + ", description=" + description
                + ", categoryIds=" + categoryIds
                + ", ownerMembershipId=" + ownerMembershipId
                + ", ownerUserId=" + ownerUserId
                + ", status=" + status
                + ", visibility=" + visibility
                + ", joinPolicy=" + joinPolicy
                + ", activeMemberCount=" + activeMemberCount
                + ", nextParticipantNumber=" + nextParticipantNumber
                + ", createdAt=" + createdAt
                + ", closedAt=" + closedAt
                + ", version=" + version
                + ']';
    }
}
