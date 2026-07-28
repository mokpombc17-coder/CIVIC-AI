package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.config.SubscriptionLimitProperties;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;

@Component
public final class InMemoryChatSubscriptionRegistry
        implements ChatSubscriptionRegistry {

    private final ReentrantLock lock = new ReentrantLock();
    private final Map<String, Map<String, SubscriptionDescriptor>> byConnection =
            new HashMap<>();
    private final Map<String, Set<String>> roomConnections = new HashMap<>();
    private final SubscriptionLimitProperties properties;

    public InMemoryChatSubscriptionRegistry(
            SubscriptionLimitProperties properties,
            MeterRegistry meterRegistry
    ) {
        this.properties = properties;
        Gauge.builder(
                        "stomp.subscriptions.active",
                        this,
                        InMemoryChatSubscriptionRegistry::activeSubscriptionCount)
                .register(meterRegistry);
        Gauge.builder(
                        "room.subscribers.current",
                        this,
                        InMemoryChatSubscriptionRegistry::activeRoomSubscriberCount)
                .register(meterRegistry);
    }

    @Override
    public SubscriptionRegistrationResult register(
            String connectionId,
            SubscriptionDescriptor descriptor
    ) {
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> subscriptions =
                    byConnection.computeIfAbsent(connectionId, ignored -> new HashMap<>());
            if (subscriptions.values().stream().anyMatch(existing ->
                    !existing.userId().equals(descriptor.userId()))) {
                throw new IllegalStateException(
                        "A connection cannot contain subscriptions for multiple users");
            }
            if (subscriptions.containsKey(descriptor.subscriptionId())
                    || properties.isRejectDuplicateDestination()
                    && subscriptions.values().stream().anyMatch(existing ->
                    existing.destination().equals(descriptor.destination()))) {
                removeConnectionIfEmpty(connectionId, subscriptions);
                return SubscriptionRegistrationResult.rejected(
                        SubscriptionRejectedCode.DUPLICATE_SUBSCRIPTION);
            }
            if (subscriptions.size()
                    >= properties.getMaxSubscriptionsPerConnection()) {
                removeConnectionIfEmpty(connectionId, subscriptions);
                return SubscriptionRegistrationResult.rejected(
                        SubscriptionRejectedCode.SUBSCRIPTION_LIMIT_EXCEEDED);
            }

            if (descriptor.roomId() != null) {
                Set<String> activeRooms = activeRooms(subscriptions);
                boolean alreadyInRoom = activeRooms.contains(descriptor.roomId());
                if (!alreadyInRoom && activeRooms.size()
                        >= properties.getMaxActiveRoomsPerConnection()) {
                    removeConnectionIfEmpty(connectionId, subscriptions);
                    return SubscriptionRegistrationResult.rejected(
                            SubscriptionRejectedCode.ACTIVE_ROOM_LIMIT_EXCEEDED);
                }
                Set<String> subscribers = roomConnections.computeIfAbsent(
                        descriptor.roomId(), ignored -> new HashSet<>());
                if (!subscribers.contains(connectionId)
                        && subscribers.size()
                        >= properties.getMaxSubscribersPerRoom()) {
                    removeRoomIfEmpty(descriptor.roomId(), subscribers);
                    removeConnectionIfEmpty(connectionId, subscriptions);
                    return SubscriptionRegistrationResult.rejected(
                            SubscriptionRejectedCode.ROOM_SUBSCRIBER_LIMIT_EXCEEDED);
                }
            }

            subscriptions.put(descriptor.subscriptionId(), descriptor);
            if (descriptor.roomId() != null) {
                roomConnections.computeIfAbsent(
                                descriptor.roomId(), ignored -> new HashSet<>())
                        .add(connectionId);
            }
            return SubscriptionRegistrationResult.accepted();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public boolean remove(String connectionId, String subscriptionId) {
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> subscriptions =
                    byConnection.get(connectionId);
            if (subscriptions == null) {
                return false;
            }
            SubscriptionDescriptor removed = subscriptions.remove(subscriptionId);
            if (removed == null) {
                return false;
            }
            if (removed.roomId() != null && subscriptions.values().stream().noneMatch(
                    existing -> removed.roomId().equals(existing.roomId()))) {
                removeRoomConnection(removed.roomId(), connectionId);
            }
            removeConnectionIfEmpty(connectionId, subscriptions);
            return true;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public int removeAll(String connectionId) {
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> removed =
                    byConnection.remove(connectionId);
            if (removed == null) {
                return 0;
            }
            removed.values().stream()
                    .map(SubscriptionDescriptor::roomId)
                    .filter(java.util.Objects::nonNull)
                    .distinct()
                    .forEach(roomId -> removeRoomConnection(roomId, connectionId));
            return removed.size();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public boolean hasRoomSubscription(
            String connectionId,
            String roomId
    ) {
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> subscriptions =
                    byConnection.get(connectionId);
            return subscriptions != null
                    && subscriptions.values().stream().anyMatch(
                    descriptor -> roomId.equals(descriptor.roomId()));
        } finally {
            lock.unlock();
        }
    }

    @Override
    public Set<String> findConnectionIdsByRoom(String roomId) {
        lock.lock();
        try {
            Set<String> connections = roomConnections.get(roomId);
            return connections == null
                    ? Set.of()
                    : Set.copyOf(connections);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public Set<String> findConnectionIdsByUserAndRoom(
            String userId,
            String roomId
    ) {
        lock.lock();
        try {
            Set<String> connections = new HashSet<>();
            byConnection.forEach((connectionId, descriptors) -> {
                if (descriptors.values().stream().anyMatch(descriptor ->
                        userId.equals(descriptor.userId())
                                && roomId.equals(descriptor.roomId()))) {
                    connections.add(connectionId);
                }
            });
            return Set.copyOf(connections);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public int activeSubscriptionCount() {
        lock.lock();
        try {
            return byConnection.values().stream().mapToInt(Map::size).sum();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public int activeRoomSubscriberCount() {
        lock.lock();
        try {
            return roomConnections.values().stream().mapToInt(Set::size).sum();
        } finally {
            lock.unlock();
        }
    }

    private static Set<String> activeRooms(
            Map<String, SubscriptionDescriptor> subscriptions
    ) {
        Set<String> rooms = new HashSet<>();
        subscriptions.values().stream()
                .map(SubscriptionDescriptor::roomId)
                .filter(java.util.Objects::nonNull)
                .forEach(rooms::add);
        return rooms;
    }

    private void removeRoomConnection(String roomId, String connectionId) {
        Set<String> subscribers = roomConnections.get(roomId);
        if (subscribers == null) {
            return;
        }
        subscribers.remove(connectionId);
        removeRoomIfEmpty(roomId, subscribers);
    }

    private void removeConnectionIfEmpty(
            String connectionId,
            Map<String, SubscriptionDescriptor> subscriptions
    ) {
        if (subscriptions.isEmpty()) {
            byConnection.remove(connectionId);
        }
    }

    private void removeRoomIfEmpty(String roomId, Set<String> subscribers) {
        if (subscribers.isEmpty()) {
            roomConnections.remove(roomId);
        }
    }
}
