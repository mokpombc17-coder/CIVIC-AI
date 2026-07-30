package com.hamcheeze.chat.websocket.subscription;

import com.hamcheeze.chat.websocket.config.SubscriptionLimitProperties;
import com.hamcheeze.chat.websocket.protocol.DestinationKind;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
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
    public Optional<SubscriptionDescriptor> find(
            String connectionId,
            String subscriptionId
    ) {
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> subscriptions =
                    byConnection.get(connectionId);
            return subscriptions == null
                    ? Optional.empty()
                    : Optional.ofNullable(
                            subscriptions.get(subscriptionId));
        } finally {
            lock.unlock();
        }
    }

    @Override
    public Optional<SubscriptionDescriptor> findRoomSubscription(
            String connectionId,
            String userId,
            String roomId,
            DestinationKind kind
    ) {
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> subscriptions =
                    byConnection.get(connectionId);
            if (subscriptions == null) {
                return Optional.empty();
            }
            return subscriptions.values().stream()
                    .filter(descriptor ->
                            userId.equals(descriptor.userId())
                                    && roomId.equals(
                                    descriptor.roomId())
                                    && kind == descriptor.kind())
                    .findFirst();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public int markRoomAccessRevoked(
            String connectionId,
            String roomId
    ) {
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> subscriptions =
                    byConnection.get(connectionId);
            if (subscriptions == null) {
                return 0;
            }
            int matched = 0;
            for (Map.Entry<String, SubscriptionDescriptor> entry
                    : subscriptions.entrySet()) {
                SubscriptionDescriptor descriptor = entry.getValue();
                if (roomId.equals(descriptor.roomId())
                        && roomScoped(descriptor.kind())) {
                    matched++;
                    entry.setValue(descriptor.revokeRoomAccess());
                }
            }
            return matched;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public boolean markStaleRoomAccessRevoked(
            String connectionId,
            String userId,
            String roomId,
            long currentMessageVisibleAfterSequence
    ) {
        if (currentMessageVisibleAfterSequence < 0) {
            throw new IllegalArgumentException(
                    "currentMessageVisibleAfterSequence must not be negative");
        }
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> subscriptions =
                    byConnection.get(connectionId);
            if (subscriptions == null) {
                return false;
            }
            SubscriptionDescriptor messages = subscriptions.values()
                    .stream()
                    .filter(descriptor ->
                            userId.equals(descriptor.userId())
                                    && roomId.equals(
                                    descriptor.roomId())
                                    && descriptor.kind()
                                    == DestinationKind
                                    .TOPIC_ROOM_MESSAGES)
                    .findFirst()
                    .orElse(null);
            SubscriptionDescriptor events = subscriptions.values()
                    .stream()
                    .filter(descriptor ->
                            userId.equals(descriptor.userId())
                                    && roomId.equals(
                                    descriptor.roomId())
                                    && descriptor.kind()
                                    == DestinationKind
                                    .TOPIC_ROOM_EVENTS)
                    .findFirst()
                    .orElse(null);
            boolean stale = messages != null
                    ? messages.roomAccessRevoked()
                    || messages.messageVisibleAfterSequence()
                    != currentMessageVisibleAfterSequence
                    || events != null
                    && events.roomAccessRevoked()
                    : events != null && events.roomAccessRevoked();
            if (!stale) {
                return false;
            }
            subscriptions.replaceAll((subscriptionId, descriptor) ->
                    userId.equals(descriptor.userId())
                            && roomId.equals(descriptor.roomId())
                            && roomScoped(descriptor.kind())
                            ? descriptor.revokeRoomAccess()
                            : descriptor);
            return true;
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
    public boolean hasRoomSubscription(
            String connectionId,
            String userId,
            String roomId,
            DestinationKind kind
    ) {
        lock.lock();
        try {
            Map<String, SubscriptionDescriptor> subscriptions =
                    byConnection.get(connectionId);
            return subscriptions != null
                    && subscriptions.values().stream().anyMatch(
                    descriptor ->
                            userId.equals(descriptor.userId())
                                    && roomId.equals(
                                    descriptor.roomId())
                                    && kind == descriptor.kind());
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

    private static boolean roomScoped(DestinationKind kind) {
        return kind == DestinationKind.TOPIC_ROOM_MESSAGES
                || kind == DestinationKind.TOPIC_ROOM_EVENTS;
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
