package com.hamcheeze.chat.room.persistence;

import com.hamcheeze.chat.room.RoomParticipation;

import java.util.List;
import java.util.Optional;

public interface RoomParticipationStore {

    Optional<RoomParticipation> findById(String participationId);

    Optional<RoomParticipation> findActiveByMembershipId(
            String membershipId
    );

    boolean existsByMembershipId(String membershipId);

    Optional<RoomParticipation> findLatestByMembershipId(
            String membershipId
    );

    List<RoomParticipation> findByRoomId(String roomId);

    void insert(RoomParticipation participation);

    boolean replaceIfVersionMatches(
            RoomParticipation participation,
            long expectedVersion
    );
}
