package ai.civic.mainauth;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.DriverManager;
import java.io.IOException;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.containers.wait.strategy.Wait;

@Testcontainers(disabledWithoutDocker = true)
class MigrationTest {
    private static final int POSTGRES_HOST_PORT = availablePort();

    @Container
    static final PostgreSQLContainer<?> POSTGRES = postgres();

    private static PostgreSQLContainer<?> postgres() {
        var container = new PostgreSQLContainer<>("postgres:16.9-alpine");
        // Colima's VZ port forwarder requires an explicit host port rather than Docker's ephemeral port.
        container.setPortBindings(List.of("127.0.0.1:" + POSTGRES_HOST_PORT + ":5432"));
        container.waitingFor(Wait.forListeningPort().withStartupTimeout(Duration.ofSeconds(60)));
        return container;
    }

    private static int availablePort() {
        try (var socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException exception) {
            throw new IllegalStateException("Could not reserve a PostgreSQL test port", exception);
        }
    }

    @Test
    void createsAuthoritativeTablesAndBootstrapAdministrator() throws Exception {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .placeholders(Map.of(
                        "bootstrap_admin_email", "bootstrap@example.test",
                        "bootstrap_admin_password_hash", "$argon2id$v=19$m=65536,t=3,p=1$test$test"))
                .load()
                .migrate();

        var requiredTables = List.of(
                "users", "credentials", "roles", "user_roles", "questionnaire_schemas",
                "questionnaire_responses", "consent_evidence", "sessions", "auth_challenges",
                "notification_outbox", "audit_outbox", "audit_events", "feature_gates",
                "account_state_outbox");

        try (var connection = DriverManager.getConnection(
                        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
                var statement = connection.prepareStatement(
                        "select table_name from information_schema.tables where table_schema = 'public'")) {
            try (var rows = statement.executeQuery()) {
                var actual = new java.util.HashSet<String>();
                while (rows.next()) actual.add(rows.getString(1));
                assertThat(actual).containsAll(requiredTables);
            }

            try (var admin = connection.prepareStatement("""
                    select u.origin, u.state, c.must_change_password, r.code
                    from users u
                    join credentials c on c.user_id = u.id
                    join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                    join roles r on r.id = ur.role_id
                    where u.normalized_email = 'bootstrap@example.test'
                    """)) {
                try (var row = admin.executeQuery()) {
                    assertThat(row.next()).isTrue();
                    assertThat(row.getString("origin")).isEqualTo("BOOTSTRAP_ADMIN");
                    assertThat(row.getString("state")).isEqualTo("ACTIVE");
                    assertThat(row.getBoolean("must_change_password")).isTrue();
                    assertThat(row.getString("code")).isEqualTo("SUPER_ADMIN");
                    assertThat(row.next()).isFalse();
                }
            }
        }
    }
}
