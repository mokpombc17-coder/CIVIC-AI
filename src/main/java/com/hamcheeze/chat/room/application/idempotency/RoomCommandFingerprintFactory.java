package com.hamcheeze.chat.room.application.idempotency;

import com.hamcheeze.chat.room.application.command.BanMemberCommand;
import com.hamcheeze.chat.room.application.command.CloseRoomCommand;
import com.hamcheeze.chat.room.application.command.CreateRoomCommand;
import com.hamcheeze.chat.room.application.command.JoinRoomCommand;
import com.hamcheeze.chat.room.application.command.LeaveRoomCommand;
import com.hamcheeze.chat.room.application.command.RoomCommand;
import com.hamcheeze.chat.room.application.command.TransferOwnershipCommand;
import com.hamcheeze.chat.room.application.command.UnbanMemberCommand;
import com.hamcheeze.chat.room.application.command.UpdateRoomSettingsCommand;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class RoomCommandFingerprintFactory {

    private static final String FINGERPRINT_VERSION = "v1";

    public String create(RoomCommand command) {
        StringBuilder canonical = new StringBuilder(FINGERPRINT_VERSION);
        append(canonical, "commandType", command.commandType().name());
        append(canonical, "requesterUserId", command.requesterUserId());
        if (command instanceof CreateRoomCommand createRoom) {
            append(canonical, "name", createRoom.name());
            append(canonical, "visibility", createRoom.visibility().name());
            append(canonical, "joinPolicy", createRoom.joinPolicy().name());
            if (!createRoom.description().isEmpty()) {
                append(
                        canonical,
                        "description",
                        createRoom.description());
            }
        } else if (command instanceof JoinRoomCommand joinRoom) {
            append(canonical, "roomId", joinRoom.roomId());
        } else if (command instanceof LeaveRoomCommand leaveRoom) {
            append(canonical, "roomId", leaveRoom.roomId());
        } else if (command
                instanceof TransferOwnershipCommand transfer) {
            append(canonical, "roomId", transfer.roomId());
            append(canonical, "targetUserId", transfer.targetUserId());
        } else if (command instanceof BanMemberCommand banMember) {
            append(canonical, "roomId", banMember.roomId());
            append(canonical, "targetUserId", banMember.targetUserId());
        } else if (command instanceof UnbanMemberCommand unbanMember) {
            append(canonical, "roomId", unbanMember.roomId());
            append(
                    canonical,
                    "targetUserId",
                    unbanMember.targetUserId());
        } else if (command instanceof CloseRoomCommand closeRoom) {
            append(canonical, "roomId", closeRoom.roomId());
        } else if (command
                instanceof UpdateRoomSettingsCommand update) {
            append(canonical, "roomId", update.roomId());
            appendPatch(
                    canonical,
                    "name",
                    update.namePresent(),
                    update.name());
            appendPatch(
                    canonical,
                    "description",
                    update.descriptionPresent(),
                    update.description());
            appendPatch(
                    canonical,
                    "visibility",
                    update.visibilityPresent(),
                    update.visibility() == null
                            ? null
                            : update.visibility().name());
            appendPatch(
                    canonical,
                    "joinPolicy",
                    update.joinPolicyPresent(),
                    update.joinPolicy() == null
                            ? null
                            : update.joinPolicy().name());
        } else {
            throw new IllegalArgumentException(
                    "Unsupported room command: "
                            + command.getClass().getName());
        }
        return "sha256:" + sha256(canonical.toString());
    }

    private static void appendPatch(
            StringBuilder target,
            String field,
            boolean present,
            String value
    ) {
        append(
                target,
                field + ".present",
                Boolean.toString(present));
        if (present) {
            append(target, field + ".value", value);
        }
    }

    private static void append(
            StringBuilder target,
            String field,
            String value
    ) {
        target.append('|')
                .append(field)
                .append('=')
                .append(escape(value));
    }

    private static String escape(String value) {
        return value.replace("%", "%25")
                .replace("|", "%7C")
                .replace("=", "%3D");
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest =
                    MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 is not available",
                    exception);
        }
    }
}
