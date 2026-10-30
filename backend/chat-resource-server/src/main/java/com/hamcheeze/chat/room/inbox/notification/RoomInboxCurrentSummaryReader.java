package com.hamcheeze.chat.room.inbox.notification;

import java.util.Optional;

public interface RoomInboxCurrentSummaryReader {

    Optional<RoomInboxCurrentLastMessage> findCurrent(String roomId);
}
