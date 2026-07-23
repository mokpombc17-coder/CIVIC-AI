package com.hamcheeze.chat.websocket.connection;

public interface ActiveConnectionRegistry {

    ConnectionActivation activate(String userId, String connectionId);

    boolean isActive(String userId, String connectionId);

    boolean deactivate(String userId, String connectionId);

    int activeCount();
}
