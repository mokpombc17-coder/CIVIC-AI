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
        Long newOwnerMembershipVersion
) {

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
}
