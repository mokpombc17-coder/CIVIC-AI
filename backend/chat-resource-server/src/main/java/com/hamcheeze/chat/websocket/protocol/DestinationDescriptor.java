package com.hamcheeze.chat.websocket.protocol;

public record DestinationDescriptor(
        DestinationKind kind,
        String destination,
        String roomId
) {
    public boolean roomScoped() {
        return roomId != null;
    }

    public boolean userScoped() {
        return kind == DestinationKind.USER_COMMAND_RESULTS
                || kind == DestinationKind.USER_SYSTEM_EVENTS;
    }
}
