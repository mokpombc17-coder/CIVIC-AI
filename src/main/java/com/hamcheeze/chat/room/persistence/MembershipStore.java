package com.hamcheeze.chat.room.persistence;

import com.hamcheeze.chat.room.Membership;

import java.util.Optional;

public interface MembershipStore {

    Optional<Membership> findById(String membershipId);

    Optional<Membership> findByRoomIdAndUserId(
            String roomId,
            String userId
    );

    void insert(Membership membership);

    boolean replaceIfVersionMatches(
            Membership membership,
            long expectedVersion
    );
}
