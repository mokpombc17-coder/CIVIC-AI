package com.hamcheeze.chat.room.application.result;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.persistence.RoomCommandType;

import java.util.Objects;

public record RoomCommandResult(
        RoomCommandType commandType,
        RoomCommandResultCode code,
        String roomId,
        String membershipId,
        String membershipUserId,
        String ownerMembershipId,
        String ownerUserId,
        String previousOwnerUserId,
        String newOwnerUserId,
        String previousOwnerMembershipId,
        String newOwnerMembershipId,
        String targetUserId,
        String targetMembershipId,
        Long roomVersion,
        Long membershipVersion,
        Long ownerMembershipVersion,
        Long previousOwnerMembershipVersion,
        Long newOwnerMembershipVersion,
        RoomSettingsSnapshot roomSettings
) {

    public RoomCommandResult(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            String roomId,
            String membershipId,
            String membershipUserId,
            String ownerMembershipId,
            String ownerUserId,
            String previousOwnerUserId,
            String newOwnerUserId,
            String previousOwnerMembershipId,
            String newOwnerMembershipId,
            String targetUserId,
            String targetMembershipId,
            Long roomVersion,
            Long membershipVersion,
            Long ownerMembershipVersion,
            Long previousOwnerMembershipVersion,
            Long newOwnerMembershipVersion
    ) {
        this(
                commandType,
                code,
                roomId,
                membershipId,
                membershipUserId,
                ownerMembershipId,
                ownerUserId,
                previousOwnerUserId,
                newOwnerUserId,
                previousOwnerMembershipId,
                newOwnerMembershipId,
                targetUserId,
                targetMembershipId,
                roomVersion,
                membershipVersion,
                ownerMembershipVersion,
                previousOwnerMembershipVersion,
                newOwnerMembershipVersion,
                null);
    }

    public RoomCommandResult {
        Objects.requireNonNull(commandType, "commandType");
        Objects.requireNonNull(code, "code");
        requireVersion(roomVersion, "roomVersion");
        requireVersion(membershipVersion, "membershipVersion");
        requireVersion(
                ownerMembershipVersion,
                "ownerMembershipVersion");
        requireVersion(
                previousOwnerMembershipVersion,
                "previousOwnerMembershipVersion");
        requireVersion(
                newOwnerMembershipVersion,
                "newOwnerMembershipVersion");
        validateSemantics(
                commandType,
                code,
                roomId,
                membershipId,
                membershipUserId,
                ownerMembershipId,
                ownerUserId,
                previousOwnerUserId,
                newOwnerUserId,
                previousOwnerMembershipId,
                newOwnerMembershipId,
                targetUserId,
                targetMembershipId,
                roomVersion,
                membershipVersion,
                ownerMembershipVersion,
                previousOwnerMembershipVersion,
                newOwnerMembershipVersion,
                roomSettings);
    }

    public static RoomCommandResult created(
            Room room,
            Membership ownerMembership
    ) {
        return new RoomCommandResult(
                RoomCommandType.CREATE_ROOM,
                RoomCommandResultCode.ROOM_CREATED,
                room.roomId(),
                null,
                null,
                ownerMembership.membershipId(),
                ownerMembership.userId(),
                null,
                null,
                null,
                null,
                null,
                null,
                room.version(),
                null,
                ownerMembership.version(),
                null,
                null);
    }

    public static RoomCommandResult membership(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            Room room,
            Membership membership
    ) {
        return new RoomCommandResult(
                commandType,
                code,
                room.roomId(),
                membership.membershipId(),
                membership.userId(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                room.version(),
                membership.version(),
                null,
                null,
                null);
    }

    public static RoomCommandResult targetMembership(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            Room room,
            Membership membership
    ) {
        return new RoomCommandResult(
                commandType,
                code,
                room.roomId(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                membership.userId(),
                membership.membershipId(),
                room.version(),
                membership.version(),
                null,
                null,
                null);
    }

    public static RoomCommandResult ownershipTransferred(
            Room room,
            Membership previousOwner,
            Membership newOwner
    ) {
        return new RoomCommandResult(
                RoomCommandType.TRANSFER_OWNERSHIP,
                RoomCommandResultCode.OWNERSHIP_TRANSFERRED,
                room.roomId(),
                null,
                null,
                null,
                null,
                previousOwner.userId(),
                newOwner.userId(),
                previousOwner.membershipId(),
                newOwner.membershipId(),
                null,
                null,
                room.version(),
                null,
                null,
                previousOwner.version(),
                newOwner.version());
    }

    public static RoomCommandResult closed(
            RoomCommandResultCode code,
            Room room,
            Membership owner
    ) {
        return new RoomCommandResult(
                RoomCommandType.CLOSE_ROOM,
                code,
                room.roomId(),
                null,
                null,
                owner.membershipId(),
                owner.userId(),
                null,
                null,
                null,
                null,
                null,
                null,
                room.version(),
                null,
                owner.version(),
                null,
                null);
    }

    public static RoomCommandResult settings(
            RoomCommandResultCode code,
            Room room
    ) {
        if (code != RoomCommandResultCode.ROOM_SETTINGS_UPDATED
                && code
                != RoomCommandResultCode.ROOM_SETTINGS_UNCHANGED) {
            throw new IllegalArgumentException(
                    "Invalid settings result code: " + code);
        }
        return new RoomCommandResult(
                RoomCommandType.UPDATE_ROOM_SETTINGS,
                code,
                room.roomId(),
                null,
                null,
                null,
                room.ownerUserId(),
                null,
                null,
                null,
                null,
                null,
                null,
                room.version(),
                null,
                null,
                null,
                null,
                new RoomSettingsSnapshot(
                        room.name(),
                        room.description(),
                        room.categoryIds(),
                        room.visibility(),
                        room.joinPolicy()));
    }

    public static RoomCommandResult rejection(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            String roomId,
            String targetUserId
    ) {
        if (!code.rejection()) {
            throw new IllegalArgumentException(
                    "Result code is not a rejection: " + code);
        }
        return new RoomCommandResult(
                commandType,
                code,
                roomId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                targetUserId,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    private static void requireVersion(
            Long version,
            String fieldName
    ) {
        if (version != null && version < 0) {
            throw new IllegalArgumentException(
                    fieldName + " must not be negative");
        }
    }

    private static void validateSemantics(
            RoomCommandType commandType,
            RoomCommandResultCode code,
            String roomId,
            String membershipId,
            String membershipUserId,
            String ownerMembershipId,
            String ownerUserId,
            String previousOwnerUserId,
            String newOwnerUserId,
            String previousOwnerMembershipId,
            String newOwnerMembershipId,
            String targetUserId,
            String targetMembershipId,
            Long roomVersion,
            Long membershipVersion,
            Long ownerMembershipVersion,
            Long previousOwnerMembershipVersion,
            Long newOwnerMembershipVersion,
            RoomSettingsSnapshot roomSettings
    ) {
        requireNonBlank(roomId, "roomId");
        if (code.rejection()) {
            return;
        }
        if (!supports(commandType, code)) {
            throw new IllegalArgumentException(
                    "Result code " + code
                            + " is not valid for " + commandType);
        }
        switch (code) {
            case ROOM_CREATED -> {
                requireNonBlank(
                        ownerMembershipId,
                        "ownerMembershipId");
                requireNonBlank(ownerUserId, "ownerUserId");
                requireRequiredVersion(
                        roomVersion,
                        "roomVersion");
                requireRequiredVersion(
                        ownerMembershipVersion,
                        "ownerMembershipVersion");
            }
            case JOINED, REJOINED, ALREADY_ACTIVE,
                    LEFT, ALREADY_LEFT -> {
                requireNonBlank(membershipId, "membershipId");
                requireNonBlank(
                        membershipUserId,
                        "membershipUserId");
                requireRequiredVersion(
                        roomVersion,
                        "roomVersion");
                requireRequiredVersion(
                        membershipVersion,
                        "membershipVersion");
            }
            case OWNERSHIP_TRANSFERRED -> {
                requireNonBlank(
                        previousOwnerUserId,
                        "previousOwnerUserId");
                requireNonBlank(
                        newOwnerUserId,
                        "newOwnerUserId");
                requireNonBlank(
                        previousOwnerMembershipId,
                        "previousOwnerMembershipId");
                requireNonBlank(
                        newOwnerMembershipId,
                        "newOwnerMembershipId");
                requireRequiredVersion(
                        roomVersion,
                        "roomVersion");
                requireRequiredVersion(
                        previousOwnerMembershipVersion,
                        "previousOwnerMembershipVersion");
                requireRequiredVersion(
                        newOwnerMembershipVersion,
                        "newOwnerMembershipVersion");
            }
            case BANNED, ALREADY_BANNED,
                    UNBANNED, ALREADY_UNBANNED -> {
                requireNonBlank(targetUserId, "targetUserId");
                requireNonBlank(
                        targetMembershipId,
                        "targetMembershipId");
                requireRequiredVersion(
                        roomVersion,
                        "roomVersion");
                requireRequiredVersion(
                        membershipVersion,
                        "membershipVersion");
            }
            case CLOSED, ALREADY_CLOSED -> {
                requireNonBlank(
                        ownerMembershipId,
                        "ownerMembershipId");
                requireNonBlank(ownerUserId, "ownerUserId");
                requireRequiredVersion(
                        roomVersion,
                        "roomVersion");
                requireRequiredVersion(
                        ownerMembershipVersion,
                        "ownerMembershipVersion");
            }
            case ROOM_SETTINGS_UPDATED,
                    ROOM_SETTINGS_UNCHANGED -> {
                requireNonBlank(ownerUserId, "ownerUserId");
                requireRequiredVersion(
                        roomVersion,
                        "roomVersion");
                Objects.requireNonNull(
                        roomSettings,
                        "roomSettings");
            }
            default -> throw new IllegalArgumentException(
                    "Unsupported success result code: " + code);
        }
    }

    private static boolean supports(
            RoomCommandType commandType,
            RoomCommandResultCode code
    ) {
        return switch (commandType) {
            case CREATE_ROOM ->
                    code == RoomCommandResultCode.ROOM_CREATED;
            case JOIN_ROOM ->
                    code == RoomCommandResultCode.JOINED
                            || code
                            == RoomCommandResultCode.REJOINED
                            || code
                            == RoomCommandResultCode.ALREADY_ACTIVE;
            case LEAVE_ROOM ->
                    code == RoomCommandResultCode.LEFT
                            || code
                            == RoomCommandResultCode.ALREADY_LEFT;
            case TRANSFER_OWNERSHIP ->
                    code == RoomCommandResultCode
                            .OWNERSHIP_TRANSFERRED;
            case BAN_MEMBER ->
                    code == RoomCommandResultCode.BANNED
                            || code
                            == RoomCommandResultCode.ALREADY_BANNED;
            case UNBAN_MEMBER ->
                    code == RoomCommandResultCode.UNBANNED
                            || code
                            == RoomCommandResultCode.ALREADY_UNBANNED;
            case CLOSE_ROOM ->
                    code == RoomCommandResultCode.CLOSED
                            || code
                            == RoomCommandResultCode.ALREADY_CLOSED;
            case UPDATE_ROOM_SETTINGS ->
                    code
                            == RoomCommandResultCode
                            .ROOM_SETTINGS_UPDATED
                            || code
                            == RoomCommandResultCode
                            .ROOM_SETTINGS_UNCHANGED;
        };
    }

    private static void requireNonBlank(
            String value,
            String fieldName
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
    }

    private static void requireRequiredVersion(
            Long version,
            String fieldName
    ) {
        if (version == null) {
            throw new IllegalArgumentException(
                    fieldName + " must not be null");
        }
        requireVersion(version, fieldName);
    }
}
