package com.hamcheeze.chat.room.api.dto;

import com.hamcheeze.chat.room.JoinPolicy;
import com.hamcheeze.chat.room.RoomCategory;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record AdminRoomCreationRequestResponse(
        String creationRequestId,
        String requesterUserId,
        String name,
        String description,
        List<RoomCategory> categories,
        RoomVisibility visibility,
        JoinPolicy joinPolicy,
        RoomCreationRequestStatus status,
        Instant requestedAt,
        Instant resolvedAt,
        String roomId,
        String ownerMembershipId,
        Long roomVersion,
        Long ownerMembershipVersion,
        String rejectionReason,
        boolean replayed
) {

    public AdminRoomCreationRequestResponse {
        creationRequestId = requireText(
                creationRequestId,
                "creationRequestId");
        requesterUserId = requireText(
                requesterUserId,
                "requesterUserId");
        name = requireText(name, "name");
        Objects.requireNonNull(description, "description");
        categories = List.copyOf(
                Objects.requireNonNull(categories, "categories"));
        Objects.requireNonNull(visibility, "visibility");
        Objects.requireNonNull(joinPolicy, "joinPolicy");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(requestedAt, "requestedAt");
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
        return value;
    }
}
