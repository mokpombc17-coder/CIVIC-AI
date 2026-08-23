package ai.civic.mainauth.support;

import java.io.IOException;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.List;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public abstract class PostgresIntegrationTest {
    private static final int POSTGRES_HOST_PORT = availablePort();

    @Container
    protected static final PostgreSQLContainer<?> POSTGRES = postgres();

    @Container
    protected static final GenericContainer<?> REDIS = new GenericContainer<>(
            DockerImageName.parse("redis:7.4-alpine"))
            .withExposedPorts(6379)
            .waitingFor(Wait.forListeningPort().withStartupTimeout(Duration.ofSeconds(60)));

    private static PostgreSQLContainer<?> postgres() {
        var container = new PostgreSQLContainer<>("postgres:16.9-alpine");
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

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.url", () ->
                "redis://" + REDIS.getHost() + ":" + REDIS.getMappedPort(6379));
        registry.add("spring.flyway.placeholders.bootstrap_admin_email", () -> "bootstrap@example.test");
        registry.add("spring.flyway.placeholders.bootstrap_admin_password_hash",
                () -> "$argon2id$v=19$m=65536,t=3,p=1$test$test");
    }
}
