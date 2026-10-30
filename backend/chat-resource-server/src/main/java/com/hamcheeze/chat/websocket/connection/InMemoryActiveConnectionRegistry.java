package com.hamcheeze.chat.websocket.connection;

import com.hamcheeze.chat.websocket.config.ConnectionLimitProperties;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;

@Component
public final class InMemoryActiveConnectionRegistry
        implements ActiveConnectionRegistry {

    private final ReentrantLock lock = new ReentrantLock();
    private final Map<String, String> connectionByUser = new HashMap<>();
    private final Map<String, String> userByConnection = new HashMap<>();
    private final int maximumConnections;

    public InMemoryActiveConnectionRegistry(
            ConnectionLimitProperties properties,
            MeterRegistry meterRegistry
    ) {
        this.maximumConnections = properties.getMaxActiveAuthenticated();
        Gauge.builder(
                        "websocket.connections.active_authenticated",
                        this,
                        InMemoryActiveConnectionRegistry::activeCount)
                .register(meterRegistry);
    }

    @Override
    public ConnectionActivation activate(String userId, String connectionId) {
        lock.lock();
        try {
            String existing = connectionByUser.get(userId);
            if (existing == null && connectionByUser.size() >= maximumConnections) {
                return ConnectionActivation.capacityExceeded();
            }
            if (connectionId.equals(existing)) {
                return ConnectionActivation.activated(null);
            }

            connectionByUser.put(userId, connectionId);
            userByConnection.put(connectionId, userId);
            if (existing != null) {
                userByConnection.remove(existing);
            }
            return ConnectionActivation.activated(existing);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public boolean isActive(String userId, String connectionId) {
        lock.lock();
        try {
            return connectionId.equals(connectionByUser.get(userId));
        } finally {
            lock.unlock();
        }
    }

    @Override
    public boolean deactivate(String userId, String connectionId) {
        lock.lock();
        try {
            if (!connectionId.equals(connectionByUser.get(userId))) {
                userByConnection.remove(connectionId);
                return false;
            }
            connectionByUser.remove(userId);
            userByConnection.remove(connectionId);
            return true;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public Optional<String> findConnectionIdByUser(String userId) {
        lock.lock();
        try {
            return Optional.ofNullable(connectionByUser.get(userId));
        } finally {
            lock.unlock();
        }
    }

    @Override
    public Optional<String> findUserIdByConnection(String connectionId) {
        lock.lock();
        try {
            return Optional.ofNullable(userByConnection.get(connectionId));
        } finally {
            lock.unlock();
        }
    }

    @Override
    public Map<String, String> connectionIdsByUser() {
        lock.lock();
        try {
            return Map.copyOf(connectionByUser);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public int activeCount() {
        lock.lock();
        try {
            return connectionByUser.size();
        } finally {
            lock.unlock();
        }
    }
}
