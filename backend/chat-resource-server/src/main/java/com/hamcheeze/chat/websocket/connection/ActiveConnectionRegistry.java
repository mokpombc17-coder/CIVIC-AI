package com.hamcheeze.chat.websocket.connection;

import java.util.Map;
import java.util.Optional;

public interface ActiveConnectionRegistry {

    ConnectionActivation activate(String userId, String connectionId);

    boolean isActive(String userId, String connectionId);

    boolean deactivate(String userId, String connectionId);

    Optional<String> findConnectionIdByUser(String userId);

    Optional<String> findUserIdByConnection(String connectionId);

    Map<String, String> connectionIdsByUser();

    int activeCount();
}
