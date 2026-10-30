package com.hamcheeze.chat.room.creation.persistence;

import com.hamcheeze.chat.room.creation.RoomCreationRequest;
import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;

import java.time.Instant;
import java.util.Optional;

public interface RoomCreationRequestStore {

    RoomCreationRequestInsertResult insertPending(
            RoomCreationRequest request,
            int maxPendingRequestsPerUser
    );

    Optional<RoomCreationRequest> findById(
            String creationRequestId
    );

    Optional<RoomCreationRequest> findByRequest(
            String requesterUserId,
            String clientRequestId
    );

    boolean replacePendingIfVersionMatches(
            RoomCreationRequest request,
            long expectedVersion
    );

    long countPendingByRequester(String requesterUserId);

    RoomCreationRequestSlice findByRequester(
            String requesterUserId,
            Instant afterRequestedAt,
            String afterCreationRequestId,
            int limit
    );

    RoomCreationRequestSlice findByStatus(
            RoomCreationRequestStatus status,
            Instant afterRequestedAt,
            String afterCreationRequestId,
            int limit
    );
}
