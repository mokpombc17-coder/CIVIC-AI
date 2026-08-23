package ai.civic.mainauth.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import ai.civic.mainauth.admin.AdminPolicyException;
import ai.civic.mainauth.auth.AuthenticationFlowService;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.main.lazy-initialization=true")
class MainPrivacyDeletionTest extends PostgresIntegrationTest {
    @Autowired MainPrivacyDeletionHandler deletion;
    @Autowired AuthenticationFlowService authentication;
    @Autowired JdbcTemplate jdbc;

    @Test
    void privacyDeletionCannotRemoveTheLastActiveHighestAdministrator() {
        var highestAdministrators = jdbc.queryForList("""
                select u.id from users u
                join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
                join roles r on r.id = ur.role_id
                where u.state = 'ACTIVE' and r.highest_admin
                order by u.created_at
                """, UUID.class);
        var lastHighestAdministrator = highestAdministrators.getFirst();
        var temporarilyInactive = highestAdministrators.stream().skip(1).toList();
        temporarilyInactive.forEach(id ->
                jdbc.update("update users set state = 'DEACTIVATED' where id = ?", id));

        try {
            assertThatThrownBy(() -> deletion.delete(lastHighestAdministrator, "highest-admin-deletion"))
                    .isInstanceOf(AdminPolicyException.class)
                    .hasMessageContaining("last active highest administrator");
            assertThat(jdbc.queryForObject(
                    "select state from users where id = ?", String.class, lastHighestAdministrator))
                    .isEqualTo("ACTIVE");
        } finally {
            temporarilyInactive.forEach(id ->
                    jdbc.update("update users set state = 'ACTIVE' where id = ?", id));
        }
    }

    @Test
    void inactiveHighestAdministratorDoesNotConsumeTheLastActiveAdministratorGuard() {
        var subject = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values ('inactive-admin-delete@example.com','inactive-admin-delete@example.com',
                        'ADMIN_CREATED','DEACTIVATED',now()) returning id
                """, UUID.class);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'hash')", subject);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'SUPER_ADMIN'
                """, subject);

        var result = deletion.delete(subject, "inactive-highest-admin-deletion");

        assertThat(result.deleted()).isTrue();
        assertThat(jdbc.queryForObject(
                "select state from users where id = ?", String.class, subject)).isEqualTo("DELETED");
    }

    @Test
    void deletionIsIdempotentLeavesOnlyTombstoneAndPreventsReactivation() {
        var user = createUser();
        jdbc.update("""
                insert into signup_flows(
                    email, normalized_email, questionnaire_schema_id, document_versions, expires_at, completed_at
                ) select 'delete-me@example.com', 'delete-me@example.com', id, '{}'::jsonb,
                         now() + interval '1 hour', now()
                  from questionnaire_schemas order by version desc limit 1
                """);
        jdbc.update("""
                insert into notification_outbox(event_type, recipient, payload)
                values ('PASSWORD_RESET', 'delete-me@example.com', '{}'::jsonb)
                """);
        jdbc.update("""
                insert into login_throttles(identity_hash, source_ip)
                values (digest('delete-me@example.com', 'sha256'), '127.0.0.20')
                """);
        jdbc.update("""
                insert into pre_session_rate_limits(identity_hash, source_ip)
                values (digest('delete-me@example.com', 'sha256'), '127.0.0.21')
                """);
        var first = deletion.delete(user, "external-request-1");
        var second = deletion.delete(user, "external-request-1");
        assertThat(first.deleted()).isTrue();
        assertThat(second.alreadyDeleted()).isTrue();
        assertThat(jdbc.queryForObject("select state from users where id = ?", String.class, user))
                .isEqualTo("DELETED");
        assertThat(jdbc.queryForObject("select email from users where id = ?", String.class, user))
                .startsWith("deleted+");
        assertThat(jdbc.queryForObject(
                "select count(*) from deletion_tombstones where subject_id = ?", Integer.class, user)).isOne();
        assertThat(jdbc.queryForObject("""
                select count(*) from signup_flows where normalized_email = 'delete-me@example.com'
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_outbox where recipient = 'delete-me@example.com'
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from login_throttles
                where identity_hash = digest('delete-me@example.com', 'sha256')
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from pre_session_rate_limits
                where identity_hash = digest('delete-me@example.com', 'sha256')
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from account_state_outbox
                where user_id = ? and state = 'DELETED' and account_state_version = 1
                """, Integer.class, user)).isOne();
    }

    @Test
    void deletionErasesPurposeSpecificOpaqueAuthenticationIdentities() {
        jdbc.update("delete from opaque_auth_flows");
        var user = createUser();
        authentication.requestReactivation("delete-me@example.com", "Wrong123!");
        jdbc.update("update users set state = 'DEACTIVATED', deactivated_at = now() where id = ?", user);
        authentication.requestPasswordReset("delete-me@example.com");
        assertThat(jdbc.queryForObject(
                "select count(*) from opaque_auth_flows", Integer.class)).isEqualTo(2);

        deletion.delete(user, "opaque-identity-deletion");

        assertThat(jdbc.queryForObject(
                "select count(*) from opaque_auth_flows", Integer.class)).isZero();
    }

    @Test
    void concurrentDeletionRequestsRecheckTheTombstoneAfterSerialization() throws Exception {
        var user = createUser();
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                ready.countDown();
                start.await();
                return deletion.delete(user, "concurrent-evidence-1");
            });
            var second = executor.submit(() -> {
                ready.countDown();
                start.await();
                return deletion.delete(user, "concurrent-evidence-2");
            });
            assertThat(ready.await(2, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            var results = java.util.List.of(first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS));
            assertThat(results)
                    .extracting(MainPrivacyDeletionHandler.DeletionResult::deleted)
                    .containsExactlyInAnyOrder(true, false);
            assertThat(results)
                    .extracting(MainPrivacyDeletionHandler.DeletionResult::alreadyDeleted)
                    .containsExactlyInAnyOrder(false, true);
        }
        assertThat(jdbc.queryForObject(
                "select count(*) from deletion_tombstones where subject_id = ?",
                Integer.class, user)).isOne();
    }

    @Test
    void deletionRechecksATombstoneCreatedWhileWaitingForTheUserLock() throws Exception {
        var user = createUser();
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var userLock = connection.prepareStatement(
                    "select id from users where id = ? for update")) {
                userLock.setObject(1, user);
                userLock.executeQuery();
            }

            var attempt = executor.submit(() -> deletion.delete(user, "queued-deletion"));
            assertThatThrownBy(() -> attempt.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(java.util.concurrent.TimeoutException.class);

            jdbc.update("""
                    insert into deletion_tombstones(
                        subject_id, external_request_evidence_id, deletion_version
                    ) values (?, 'concurrent-deletion', 1)
                    """, user);
            connection.commit();

            assertThat(attempt.get(10, TimeUnit.SECONDS))
                    .extracting(MainPrivacyDeletionHandler.DeletionResult::deleted,
                            MainPrivacyDeletionHandler.DeletionResult::alreadyDeleted)
                    .containsExactly(false, true);
        }
    }

    @Test
    void deletionLocksTheAuthenticationIdentityBeforeTheUser() throws Exception {
        var user = createUser();
        var lockKey = ByteBuffer.wrap(MessageDigest.getInstance("SHA-256")
                .digest("delete-me@example.com".getBytes(StandardCharsets.UTF_8))).getLong();
        try (var executor = Executors.newSingleThreadExecutor();
                var connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (var identityLock = connection.prepareStatement(
                    "select pg_advisory_xact_lock(?)")) {
                identityLock.setLong(1, lockKey);
                identityLock.executeQuery();
            }

            var attempt = executor.submit(() -> deletion.delete(user, "identity-serialized"));
            assertThatThrownBy(() -> attempt.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(java.util.concurrent.TimeoutException.class);
            try (var userLock = connection.prepareStatement(
                    "select id from users where id = ? for update nowait")) {
                userLock.setObject(1, user);
                assertThat(userLock.executeQuery().next()).isTrue();
            }
            connection.rollback();

            assertThat(attempt.get(10, TimeUnit.SECONDS).deleted()).isTrue();
        }
    }

    private UUID createUser() {
        var id = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values ('delete-me@example.com','delete-me@example.com','SIGNUP','ACTIVE',now()) returning id
                """, UUID.class);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'hash')", id);
        return id;
    }
}
