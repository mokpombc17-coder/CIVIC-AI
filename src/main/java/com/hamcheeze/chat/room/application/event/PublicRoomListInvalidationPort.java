package com.hamcheeze.chat.room.application.event;

public interface PublicRoomListInvalidationPort {

    /**
     * Requests a best-effort public Room list invalidation signal.
     * Implementations must not throw.
     */
    void requestInvalidation();

    static PublicRoomListInvalidationPort disabled() {
        return () -> {
        };
    }
}
