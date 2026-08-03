package com.hamcheeze.chat.room.inbox;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface RoomReadStateStore {

    Optional<RoomReadState> findByMembershipId(String membershipId);

    Map<String, RoomReadState> findByMembershipIds(
            List<String> membershipIds);

    RoomReadStateAdvance advance(
            String membershipId,
            String roomId,
            String userId,
            long throughSequence,
            Instant updatedAt);
}
