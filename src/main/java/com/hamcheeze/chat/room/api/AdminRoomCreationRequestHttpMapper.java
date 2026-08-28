package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.room.api.dto.AdminRoomCreationRequestResponse;
import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestExecution;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.net.URI;
import java.util.Objects;

public final class AdminRoomCreationRequestHttpMapper {

    public ResponseEntity<AdminRoomCreationRequestResponse> approved(
            RoomCreationRequestExecution execution
    ) {
        RoomCreationRequest request = Objects.requireNonNull(
                execution,
                "execution").request();
        HttpStatus status = execution.replayed()
                ? HttpStatus.OK
                : HttpStatus.CREATED;
        return ResponseEntity.status(status)
                .location(URI.create(
                        "/api/v1/rooms/"
                                + request.approvedRoomId()))
                .body(response(request, execution.replayed()));
    }

    public ResponseEntity<AdminRoomCreationRequestResponse> rejected(
            RoomCreationRequestExecution execution
    ) {
        RoomCreationRequest request = Objects.requireNonNull(
                execution,
                "execution").request();
        return ResponseEntity.ok()
                .location(requestLocation(request.creationRequestId()))
                .body(response(request, execution.replayed()));
    }

    public AdminRoomCreationRequestResponse response(
            RoomCreationRequest request,
            boolean replayed
    ) {
        RoomCreationRequest source = Objects.requireNonNull(
                request,
                "request");
        return new AdminRoomCreationRequestResponse(
                source.creationRequestId(),
                source.requesterUserId(),
                source.name(),
                source.description(),
                source.categoryIds(),
                source.visibility(),
                source.joinPolicy(),
                source.status(),
                source.requestedAt(),
                source.resolvedAt(),
                source.approvedRoomId(),
                source.ownerMembershipId(),
                source.roomVersion(),
                source.ownerMembershipVersion(),
                source.rejectionReason(),
                replayed);
    }

    private static URI requestLocation(String creationRequestId) {
        return URI.create(
                "/api/v1/admin/room-creation-requests/"
                        + creationRequestId);
    }
}
