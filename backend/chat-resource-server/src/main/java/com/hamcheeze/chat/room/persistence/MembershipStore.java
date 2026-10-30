package com.hamcheeze.chat.room.persistence;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;

import java.util.List;
import java.util.Optional;

public interface MembershipStore {

    Optional<Membership> findById(String membershipId);

    Optional<Membership> findByRoomIdAndUserId(
            String roomId,
            String userId
    );

    List<Membership> findByRoomIdAndStatus(
            String roomId,
            MembershipStatus status
    );

    void insert(Membership membership);

    boolean replaceIfVersionMatches(
            Membership membership,
            long expectedVersion
    );
}
