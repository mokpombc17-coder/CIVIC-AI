package com.hamcheeze.chat.websocket.protocol;

public enum DestinationKind {
    APP_ROOM_MESSAGES,
    TOPIC_ROOM_MESSAGES,
    TOPIC_ROOM_EVENTS,
    TOPIC_READ_RECEIPTS_DISABLED,
    USER_COMMAND_RESULTS,
    USER_SYSTEM_EVENTS,
    INVALID
}
