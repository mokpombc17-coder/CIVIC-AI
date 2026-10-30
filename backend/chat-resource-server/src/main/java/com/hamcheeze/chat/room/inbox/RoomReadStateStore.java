package com.hamcheeze.chat.room.inbox;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface RoomReadStateStore {

    Optional<RoomReadState> findByMembershipId(String membershipId);

    Map<String, RoomReadState> findByMembershipIds(
            List<String> membershipIds);

    /**
     * Monotonically advances the stored read cursor for one membership.
     *
     * <p>On normal return, the implementation guarantees all of the
     * following:</p>
     * <ul>
     *     <li>An existing {@code lastReadSequence} is never decreased.</li>
     *     <li>An existing identity tuple is never rebound to different
     *     {@code membershipId}, {@code roomId}, or {@code userId} values.</li>
     *     <li>The returned state matches the requested identity tuple.</li>
     *     <li>The returned state's {@code lastReadSequence} is greater than
     *     or equal to {@code throughSequence}.</li>
     *     <li>{@link RoomReadStateAdvance#updated()} is {@code true} only
     *     when this invocation performed an insert or a cursor-increasing
     *     write.</li>
     *     <li>An {@code updated=false} result means this invocation did not
     *     write because the persisted cursor was already equal to or greater
     *     than {@code throughSequence}, including due to a concurrent
     *     advance.</li>
     *     <li>A cursor-increasing write never decreases the stored
     *     {@code updatedAt}; it stores the greater of the existing and
     *     requested observation times.</li>
     * </ul>
     *
     * <p>The returned state confirms a persisted cursor at least as high as
     * this request. It is not a globally latest snapshot and need not include
     * advances that occur after the state was read for this result.</p>
     *
     * @param membershipId membership identity to preserve
     * @param roomId room identity to preserve
     * @param userId user identity to preserve
     * @param throughSequence requested cursor lower bound
     * @param updatedAt observation time for an insert or cursor-increasing
     *                  write; a no-op must not change the stored timestamp,
     *                  and an increase must not move it backward
     * @return the persisted state observed for this request and whether this
     *         invocation performed a write
     */
    RoomReadStateAdvance advance(
            String membershipId,
            String roomId,
            String userId,
            long throughSequence,
            Instant updatedAt);
}
