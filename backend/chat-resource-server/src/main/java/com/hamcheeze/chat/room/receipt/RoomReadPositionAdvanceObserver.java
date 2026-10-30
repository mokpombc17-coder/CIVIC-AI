package com.hamcheeze.chat.room.receipt;

public interface RoomReadPositionAdvanceObserver {

    void onAdvanced(
            String roomId,
            String membershipId,
            long membershipVersion,
            long storedLastReadSequence);

    static RoomReadPositionAdvanceObserver noop() {
        return (roomId, membershipId, membershipVersion, cursor) -> {
        };
    }
}
