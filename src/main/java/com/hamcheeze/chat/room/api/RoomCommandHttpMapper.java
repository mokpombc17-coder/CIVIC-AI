package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.CloseRoomResponse;
import com.hamcheeze.chat.room.api.dto.CreateRoomResponse;
import com.hamcheeze.chat.room.api.dto.MembershipCommandResponse;
import com.hamcheeze.chat.room.api.dto.OwnershipTransferResponse;
import com.hamcheeze.chat.room.api.dto.RoomSettingsCommandResponse;
import com.hamcheeze.chat.room.api.dto.TargetMembershipCommandResponse;
import com.hamcheeze.chat.room.application.result.RoomCommandExecution;
import com.hamcheeze.chat.room.application.result.RoomCommandResult;
import com.hamcheeze.chat.room.application.result.RoomCommandResultCode;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

import java.net.URI;

public final class RoomCommandHttpMapper {

    public ResponseEntity<Object> map(
            RoomCommandExecution execution,
            URI instance
    ) {
        RoomCommandResult result = execution.result();
        if (result.code().rejection()) {
            return rejection(execution, instance);
        }
        HttpStatus status = successStatus(result.code());
        Object body = switch (result.commandType()) {
            case CREATE_ROOM -> new CreateRoomResponse(
                    execution.clientRequestId(),
                    result.code(),
                    execution.replayed(),
                    result.roomId(),
                    result.ownerMembershipId(),
                    result.ownerUserId(),
                    result.roomVersion(),
                    result.ownerMembershipVersion());
            case JOIN_ROOM, LEAVE_ROOM ->
                    new MembershipCommandResponse(
                            execution.clientRequestId(),
                            result.code(),
                            execution.replayed(),
                            result.roomId(),
                            result.membershipId(),
                            result.membershipUserId(),
                            result.roomVersion(),
                            result.membershipVersion());
            case TRANSFER_OWNERSHIP ->
                    new OwnershipTransferResponse(
                            execution.clientRequestId(),
                            result.code(),
                            execution.replayed(),
                            result.roomId(),
                            result.previousOwnerUserId(),
                            result.newOwnerUserId(),
                            result.previousOwnerMembershipId(),
                            result.newOwnerMembershipId(),
                            result.roomVersion(),
                            result.previousOwnerMembershipVersion(),
                            result.newOwnerMembershipVersion());
            case BAN_MEMBER, UNBAN_MEMBER ->
                    new TargetMembershipCommandResponse(
                            execution.clientRequestId(),
                            result.code(),
                            execution.replayed(),
                            result.roomId(),
                            result.targetUserId(),
                            result.targetMembershipId(),
                            result.roomVersion(),
                            result.membershipVersion());
            case CLOSE_ROOM -> new CloseRoomResponse(
                    execution.clientRequestId(),
                    result.code(),
                    execution.replayed(),
                    result.roomId(),
                    result.ownerMembershipId(),
                    result.ownerUserId(),
                    result.roomVersion(),
                    result.ownerMembershipVersion());
            case UPDATE_ROOM_SETTINGS ->
                    new RoomSettingsCommandResponse(
                            execution.clientRequestId(),
                            result.code(),
                            execution.replayed(),
                            result.roomId(),
                            result.roomSettings().name(),
                            result.roomSettings().description(),
                            result.roomSettings().visibility(),
                            result.roomSettings().joinPolicy(),
                            result.roomVersion());
        };
        ResponseEntity.BodyBuilder builder =
                ResponseEntity.status(status);
        if (result.code()
                == RoomCommandResultCode.ROOM_CREATED) {
            builder.location(URI.create(
                    "/api/v1/rooms/" + result.roomId()));
        } else if (result.code()
                == RoomCommandResultCode.JOINED) {
            builder.location(URI.create(
                    "/api/v1/rooms/"
                            + result.roomId()
                            + "/memberships/me"));
        }
        return builder.body(body);
    }

    private ResponseEntity<Object> rejection(
            RoomCommandExecution execution,
            URI instance
    ) {
        RoomCommandResultCode code = execution.result().code();
        HttpStatus status = rejectionStatus(code);
        String title = code
                == RoomCommandResultCode.IDEMPOTENCY_CONFLICT
                ? "Idempotency conflict"
                : "Room command rejected";
        ProblemDetail problem = RoomProblemDetails.create(
                status,
                code.name(),
                title,
                rejectionDetail(code),
                execution.clientRequestId(),
                execution.replayed(),
                false,
                instance);
        return ResponseEntity.status(status).body(problem);
    }

    private HttpStatus successStatus(RoomCommandResultCode code) {
        return switch (code) {
            case ROOM_CREATED, JOINED -> HttpStatus.CREATED;
            case REJOINED, ALREADY_ACTIVE, LEFT, ALREADY_LEFT,
                    OWNERSHIP_TRANSFERRED, BANNED,
                    ALREADY_BANNED, UNBANNED,
                    ALREADY_UNBANNED, CLOSED,
                    ALREADY_CLOSED, ROOM_SETTINGS_UPDATED,
                    ROOM_SETTINGS_UNCHANGED -> HttpStatus.OK;
            default -> throw new IllegalArgumentException(
                    "Not a success result code: " + code);
        };
    }

    private HttpStatus rejectionStatus(
            RoomCommandResultCode code
    ) {
        return switch (code) {
            case ROOM_NOT_FOUND, MEMBERSHIP_NOT_FOUND,
                    TARGET_MEMBERSHIP_NOT_FOUND ->
                    HttpStatus.NOT_FOUND;
            case NOT_ROOM_OWNER, MEMBERSHIP_BANNED ->
                    HttpStatus.FORBIDDEN;
            case ROOM_CLOSED, JOIN_POLICY_NOT_OPEN,
                    ROOM_HAS_OTHER_ACTIVE_MEMBERS,
                    OWNER_CANNOT_LEAVE,
                    OWNER_CANNOT_BE_BANNED,
                    TARGET_MEMBERSHIP_NOT_ACTIVE,
                    TARGET_MEMBERSHIP_NOT_MEMBER,
                    OWNERSHIP_TARGET_MUST_DIFFER,
                    IDEMPOTENCY_CONFLICT ->
                    HttpStatus.CONFLICT;
            default -> throw new IllegalArgumentException(
                    "Not a rejection result code: " + code);
        };
    }

    private String rejectionDetail(
            RoomCommandResultCode code
    ) {
        return switch (code) {
            case ROOM_NOT_FOUND -> "The room was not found.";
            case MEMBERSHIP_NOT_FOUND ->
                    "The membership was not found.";
            case TARGET_MEMBERSHIP_NOT_FOUND ->
                    "The target membership was not found.";
            case NOT_ROOM_OWNER ->
                    "Only the room owner may perform this command.";
            case MEMBERSHIP_BANNED ->
                    "The membership is banned.";
            case ROOM_CLOSED -> "The room is closed.";
            case JOIN_POLICY_NOT_OPEN ->
                    "The room does not accept open joins.";
            case ROOM_HAS_OTHER_ACTIVE_MEMBERS ->
                    "The room still has other active members.";
            case OWNER_CANNOT_LEAVE ->
                    "The room owner cannot leave.";
            case OWNER_CANNOT_BE_BANNED ->
                    "The room owner cannot be banned.";
            case TARGET_MEMBERSHIP_NOT_ACTIVE ->
                    "The target membership is not active.";
            case TARGET_MEMBERSHIP_NOT_MEMBER ->
                    "The target membership is not a member.";
            case OWNERSHIP_TARGET_MUST_DIFFER ->
                    "The ownership target must be another user.";
            case IDEMPOTENCY_CONFLICT ->
                    "The Idempotency-Key was already used "
                            + "for a different request.";
            default -> throw new IllegalArgumentException(
                    "Not a rejection result code: " + code);
        };
    }
}
