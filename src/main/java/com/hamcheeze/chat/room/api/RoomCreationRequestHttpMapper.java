package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.RoomCreationRequestResponse;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestExecution;
import com.hamcheeze.chat.room.creation.RoomCreationRequestResultCode;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.net.URI;
import java.util.Objects;

public final class RoomCreationRequestHttpMapper {

    public ResponseEntity<RoomCreationRequestResponse> submission(
            RoomCreationRequestExecution execution,
            RoomStatus roomStatus
    ) {
        RoomCreationRequest request = Objects.requireNonNull(
                execution,
                "execution").request();
        HttpStatus status = switch (request.status()) {
            case APPROVED -> HttpStatus.CREATED;
            case PENDING -> HttpStatus.ACCEPTED;
            case REJECTED, CANCELED -> HttpStatus.OK;
        };
        return ResponseEntity.status(status)
                .location(location(request))
                .body(response(
                        request,
                        execution.replayed(),
                        roomStatus));
    }

    public ResponseEntity<RoomCreationRequestResponse> canceled(
            RoomCreationRequestExecution execution,
            RoomStatus roomStatus
    ) {
        RoomCreationRequest request = Objects.requireNonNull(
                execution,
                "execution").request();
        return ResponseEntity.ok()
                .location(requestLocation(request.creationRequestId()))
                .body(response(
                        request,
                        execution.replayed(),
                        roomStatus));
    }

    public RoomCreationRequestResponse response(
            RoomCreationRequest request,
            boolean replayed,
            RoomStatus roomStatus
    ) {
        RoomCreationRequest source = Objects.requireNonNull(
                request,
                "request");
        return new RoomCreationRequestResponse(
                source.clientRequestId(),
                resultCode(source.status()),
                replayed,
                source.creationRequestId(),
                source.name(),
                source.status(),
                source.requestedAt(),
                source.resolvedAt(),
                source.approvedRoomId(),
                source.ownerMembershipId(),
                source.roomVersion(),
                source.ownerMembershipVersion(),
                source.rejectionReason(),
                roomStatus);
    }

    private static RoomCreationRequestResultCode resultCode(
            RoomCreationRequestStatus status
    ) {
        return switch (status) {
            case PENDING -> RoomCreationRequestResultCode
                    .ROOM_CREATION_REQUESTED;
            case APPROVED -> RoomCreationRequestResultCode.ROOM_CREATED;
            case REJECTED -> RoomCreationRequestResultCode
                    .ROOM_CREATION_REJECTED;
            case CANCELED -> RoomCreationRequestResultCode
                    .ROOM_CREATION_CANCELED;
        };
    }

    private static URI location(RoomCreationRequest request) {
        if (request.status() == RoomCreationRequestStatus.APPROVED) {
            return URI.create(
                    "/api/v1/rooms/" + request.approvedRoomId());
        }
        return requestLocation(request.creationRequestId());
    }

    private static URI requestLocation(String creationRequestId) {
        return URI.create(
                "/api/v1/me/room-creation-requests/"
                        + creationRequestId);
    }
}
