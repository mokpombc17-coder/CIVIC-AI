package com.hamcheeze.chat.websocket.connection;

public record ConnectionActivation(
        boolean activated,
        String replacedConnectionId
) {
    public static ConnectionActivation capacityExceeded() {
        return new ConnectionActivation(false, null);
    }

    public static ConnectionActivation activated(String replacedConnectionId) {
        return new ConnectionActivation(true, replacedConnectionId);
    }
}
