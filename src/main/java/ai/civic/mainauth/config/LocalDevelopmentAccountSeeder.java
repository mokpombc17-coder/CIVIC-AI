package ai.civic.mainauth.config;

import java.net.URI;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("local")
@ConditionalOnProperty(name = "civic.local-seed.enabled", havingValue = "true")
class LocalDevelopmentAccountSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(LocalDevelopmentAccountSeeder.class);
    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "[::1]");
    private static final Set<String> ADMIN_PERMISSIONS =
            Set.of("RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN");

    private final JdbcTemplate jdbc;
    private final String datasourceUrl;
    private final String adminEmail;
    private final String adminPassword;
    private final String userPassword;
    private final Argon2PasswordEncoder passwords =
            Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();

    LocalDevelopmentAccountSeeder(
            JdbcTemplate jdbc,
            @Value("${spring.datasource.url}") String datasourceUrl,
            @Value("${civic.local-seed.admin-email}") String adminEmail,
            @Value("${civic.local-seed.admin-password}") String adminPassword,
            @Value("${civic.local-seed.user-password}") String userPassword) {
        this.jdbc = jdbc;
        this.datasourceUrl = datasourceUrl;
        this.adminEmail = normalize(adminEmail);
        this.adminPassword = adminPassword;
        this.userPassword = userPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments ignored) {
        requireLoopbackDatabase();
        jdbc.queryForList("select pg_advisory_xact_lock(hashtext('civic-main-auth-local-seed'))");

        var adminId = seedAccount(adminEmail, adminPassword, "BOOTSTRAP_ADMIN", "SUPER_ADMIN");
        unlockInitialAdminCredential(adminId);
        grantAllAdminPermissions(adminId);

        for (var number = 1; number <= 10; number++) {
            seedAccount("user%02d@dev.civic.test".formatted(number), userPassword, "SIGNUP", "PARTICIPANT");
        }

        log.info("Local development accounts are ready: {} and user01-user10@dev.civic.test", adminEmail);
    }

    private UUID seedAccount(String email, String rawPassword, String origin, String role) {
        var normalizedEmail = normalize(email);
        var existing = jdbc.query(
                "select id from users where normalized_email = ?",
                (row, ignored) -> row.getObject("id", UUID.class),
                normalizedEmail);
        var userId = existing.isEmpty() ? insertUser(normalizedEmail, origin) : existing.getFirst();

        var credentialCount = jdbc.queryForObject(
                "select count(*) from credentials where user_id = ?", Integer.class, userId);
        if (credentialCount == null || credentialCount == 0) {
            jdbc.update("""
                    insert into credentials(user_id, password_hash, must_change_password)
                    values (?, ?, false)
                    """, userId, passwords.encode(rawPassword));
        }

        jdbc.update("""
                insert into user_roles(user_id, role_id, granted_by)
                select ?, role.id, ?
                from roles role
                where role.code = ?
                  and not exists (
                      select 1 from user_roles active
                      where active.user_id = ?
                        and active.role_id = role.id
                        and active.revoked_at is null
                  )
                """, userId, userId, role, userId);

        jdbc.update("""
                insert into account_state_outbox(user_id, account_state_version, state, event_payload)
                select id, account_state_version, 'ACTIVE',
                       jsonb_build_object(
                           'subject_id', id,
                           'version', account_state_version,
                           'state', 'ACTIVE',
                           'reason', 'LOCAL_DEVELOPMENT_SEED',
                           'at', now())
                from users
                where id = ? and state = 'ACTIVE' and deleted_at is null
                on conflict (user_id, account_state_version) do nothing
                """, userId);
        return userId;
    }

    private UUID insertUser(String email, String origin) {
        return jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, ?, 'ACTIVE', now())
                returning id
                """, UUID.class, email, email, origin);
    }

    private void unlockInitialAdminCredential(UUID adminId) {
        var credential = jdbc.query("""
                select password_hash, must_change_password
                from credentials where user_id = ?
                """, (row, ignored) -> new Credential(
                row.getString("password_hash"), row.getBoolean("must_change_password")), adminId);
        if (credential.size() != 1 || !credential.getFirst().mustChangePassword()) return;
        if (!passwords.matches(adminPassword, credential.getFirst().passwordHash())) {
            throw new IllegalStateException(
                    "Local administrator password does not match the bootstrap credential; reset the local database");
        }
        jdbc.update("update credentials set must_change_password = false where user_id = ?", adminId);
    }

    private void grantAllAdminPermissions(UUID adminId) {
        for (var permission : ADMIN_PERMISSIONS) {
            jdbc.update("""
                    insert into user_permissions(user_id, permission_id, granted_by)
                    select ?, permission.id, ?
                    from permissions permission
                    where permission.code = ?
                      and not exists (
                          select 1 from user_permissions active
                          where active.user_id = ?
                            and active.permission_id = permission.id
                            and active.revoked_at is null
                      )
                    """, adminId, adminId, permission, adminId);
        }
    }

    private void requireLoopbackDatabase() {
        try {
            if (datasourceUrl == null || !datasourceUrl.startsWith("jdbc:postgresql://")) throw unsafeDatabase();
            var host = URI.create(datasourceUrl.substring("jdbc:".length())).getHost();
            if (host == null || !LOOPBACK_HOSTS.contains(host.toLowerCase(Locale.ROOT))) throw unsafeDatabase();
        } catch (IllegalArgumentException exception) {
            throw unsafeDatabase();
        }
    }

    private static IllegalStateException unsafeDatabase() {
        return new IllegalStateException(
                "Local development account seeding is allowed only for a loopback PostgreSQL URL");
    }

    private static String normalize(String email) {
        if (email == null || email.isBlank()) throw new IllegalArgumentException("Local account email is required");
        return email.strip().toLowerCase(Locale.ROOT);
    }

    private record Credential(String passwordHash, boolean mustChangePassword) {}
}
