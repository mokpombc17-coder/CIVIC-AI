package com.hamcheeze.chat.websocket.connection;

import com.hamcheeze.chat.websocket.config.ConnectionLimitProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryActiveConnectionRegistryTest {

    @Test
    void atomicallyReplacesOneUsersConnection() {
        InMemoryActiveConnectionRegistry registry = registry(2);

        assertThat(registry.activate("user-1", "connection-1"))
                .isEqualTo(ConnectionActivation.activated(null));
        assertThat(registry.activate("user-1", "connection-2"))
                .isEqualTo(
                        ConnectionActivation.activated("connection-1"));

        assertThat(registry.isActive("user-1", "connection-1")).isFalse();
        assertThat(registry.isActive("user-1", "connection-2")).isTrue();
        assertThat(registry.activeCount()).isOne();
    }

    @Test
    void enforcesGlobalCapacityButAllowsReplacement() {
        InMemoryActiveConnectionRegistry registry = registry(1);
        registry.activate("user-1", "connection-1");

        assertThat(registry.activate("user-2", "connection-2").activated())
                .isFalse();
        assertThat(registry.activate("user-1", "connection-3").activated())
                .isTrue();
    }

    @Test
    void lateDisconnectCannotRemoveReplacement() {
        InMemoryActiveConnectionRegistry registry = registry(2);
        registry.activate("user-1", "connection-1");
        registry.activate("user-1", "connection-2");

        assertThat(registry.deactivate("user-1", "connection-1")).isFalse();
        assertThat(registry.isActive("user-1", "connection-2")).isTrue();
        assertThat(registry.deactivate("user-1", "connection-2")).isTrue();
        assertThat(registry.deactivate("user-1", "connection-2")).isFalse();
    }

    @Test
    void exposesLockedBidirectionalLookupSnapshots() {
        InMemoryActiveConnectionRegistry registry = registry(2);
        registry.activate("user-1", "connection-1");

        assertThat(registry.findConnectionIdByUser("user-1"))
                .contains("connection-1");
        assertThat(registry.findUserIdByConnection("connection-1"))
                .contains("user-1");

        registry.deactivate("user-1", "connection-1");
        assertThat(registry.findConnectionIdByUser("user-1")).isEmpty();
        assertThat(registry.findUserIdByConnection("connection-1")).isEmpty();
    }

    @Test
    void exposesImmutableSnapshotOfCurrentConnections() {
        InMemoryActiveConnectionRegistry registry = registry(3);
        registry.activate("user-1", "connection-1");
        registry.activate("user-2", "connection-2");
        registry.activate("user-1", "connection-3");

        var snapshot = registry.connectionIdsByUser();
        registry.deactivate("user-2", "connection-2");

        assertThat(snapshot).containsExactlyInAnyOrderEntriesOf(
                java.util.Map.of(
                        "user-1", "connection-3",
                        "user-2", "connection-2"));
        assertThat(registry.connectionIdsByUser())
                .containsOnlyKeys("user-1");
    }

    @Test
    void rejectsTheFiveHundredAndFirstAuthenticatedConnection() {
        InMemoryActiveConnectionRegistry registry = registry(500);
        for (int index = 0; index < 500; index++) {
            assertThat(registry.activate(
                    "user-" + index, "connection-" + index).activated())
                    .isTrue();
        }

        assertThat(registry.activate(
                "user-500", "connection-500").activated())
                .isFalse();
        assertThat(registry.activeCount()).isEqualTo(500);
    }

    private static InMemoryActiveConnectionRegistry registry(int capacity) {
        ConnectionLimitProperties properties =
                new ConnectionLimitProperties();
        properties.setMaxActiveAuthenticated(capacity);
        return new InMemoryActiveConnectionRegistry(
                properties, new SimpleMeterRegistry());
    }
}
