package ai.civic.mainauth.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("local")
@Testcontainers(disabledWithoutDocker = true)
class LocalDevelopmentAccountSeederTest {
    private static final int POSTGRES_HOST_PORT = availablePort();

    @Container
    static final PostgreSQLContainer<?> POSTGRES = postgres();

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine"))
            .withExposedPorts(6379)
            .waitingFor(Wait.forListeningPort().withStartupTimeout(Duration.ofSeconds(60)));

    @Autowired JdbcTemplate jdbc;
    @Autowired LocalDevelopmentAccountSeeder seeder;

    private final Argon2PasswordEncoder passwords =
            Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();

    @DynamicPropertySource
    static void localInfrastructure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.url", () ->
                "redis://" + REDIS.getHost() + ":" + REDIS.getMappedPort(6379));
    }

    @Test
    void createsKnownLocalAccountsWithUsableRolesAndNeverResetsAnExistingPassword() throws Exception {
        var accounts = jdbc.query("""
                select u.normalized_email, u.state, u.email_verified_at is not null as verified,
                       c.password_hash, c.must_change_password, r.code as role
                from users u
                join credentials c on c.user_id = u.id
                join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                join roles r on r.id = ur.role_id
                where u.normalized_email like '%@dev.civic.test'
                order by u.normalized_email
                """, (row, ignored) -> new Account(
                row.getString("normalized_email"),
                row.getString("state"),
                row.getBoolean("verified"),
                row.getString("password_hash"),
                row.getBoolean("must_change_password"),
                row.getString("role")));

        assertThat(accounts).hasSize(11);
        assertThat(accounts.getFirst())
                .extracting(Account::email, Account::state, Account::verified, Account::mustChangePassword, Account::role)
                .containsExactly("admin@dev.civic.test", "ACTIVE", true, false, "SUPER_ADMIN");
        assertThat(passwords.matches("CivicDevAdmin!2026", accounts.getFirst().passwordHash())).isTrue();

        var expectedUsers = java.util.stream.IntStream.rangeClosed(1, 10)
                .mapToObj(number -> "user%02d@dev.civic.test".formatted(number))
                .toList();
        assertThat(accounts.subList(1, accounts.size())).allSatisfy(account -> {
            assertThat(account.state()).isEqualTo("ACTIVE");
            assertThat(account.verified()).isTrue();
            assertThat(account.mustChangePassword()).isFalse();
            assertThat(account.role()).isEqualTo("PARTICIPANT");
            assertThat(passwords.matches("CivicDevUser!2026", account.passwordHash())).isTrue();
        });
        assertThat(accounts.subList(1, accounts.size())).extracting(Account::email)
                .containsExactlyElementsOf(expectedUsers);

        assertThat(jdbc.queryForList("""
                select p.code
                from users u
                join user_permissions up on up.user_id = u.id and up.revoked_at is null
                join permissions p on p.id = up.permission_id
                where u.normalized_email = 'admin@dev.civic.test'
                order by p.code
                """, String.class)).containsExactly(
                        "CHAT_ADMIN", "RAG_ADMIN", "SIMULATION_ADMIN", "VOTE_ADMIN");
        assertThat(jdbc.queryForObject("""
                select count(*) from account_state_outbox o
                join users u on u.id = o.user_id
                where u.normalized_email like '%@dev.civic.test'
                """, Integer.class)).isEqualTo(11);

        var manuallyChanged = passwords.encode("ManuallyChanged1!");
        jdbc.update("""
                update credentials set password_hash = ?
                where user_id = (select id from users where normalized_email = 'user01@dev.civic.test')
                """, manuallyChanged);

        seeder.run(new DefaultApplicationArguments(new String[0]));

        var afterRestart = jdbc.queryForObject("""
                select c.password_hash from credentials c
                join users u on u.id = c.user_id
                where u.normalized_email = 'user01@dev.civic.test'
                """, String.class);
        assertThat(passwords.matches("ManuallyChanged1!", afterRestart)).isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from users where normalized_email like '%@dev.civic.test'", Integer.class))
                .isEqualTo(11);
    }

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

    private record Account(
            String email,
            String state,
            boolean verified,
            String passwordHash,
            boolean mustChangePassword,
            String role) {}
}
