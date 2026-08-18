package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import ai.civic.mainauth.notification.SmtpNotificationService;
import ai.civic.mainauth.notification.VerificationCodeProtector;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@SpringBootTest(properties = {
        "spring.main.lazy-initialization=true",
        "civic.session.hmac-secret=test-session-hmac-secret-with-at-least-32-bytes"
})
@AutoConfigureMockMvc
class AuthenticationLifecycleTest extends PostgresIntegrationTest {
    @Autowired AuthenticationFlowService auth;
    @Autowired SessionService sessions;
    @Autowired CsrfService csrf;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @MockitoBean SmtpNotificationService smtp;
    @MockitoSpyBean VerificationCodeProtector codeProtector;

    private UUID userId;

    @BeforeEach
    void createActiveParticipant() {
        jdbc.update("delete from sessions");
        jdbc.update("delete from login_throttles");
        jdbc.update("delete from notification_outbox");
        jdbc.update("delete from auth_challenges");
        jdbc.update("delete from account_state_outbox where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from credentials where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from user_roles where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from users where origin = 'SIGNUP'");
        userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values ('person@example.com', 'person@example.com', 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class);
        var encoded = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8().encode("Valid123!");
        jdbc.update("insert into credentials(user_id, password_hash) values (?, ?)", userId, encoded);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, userId);
    }

    @Test
    void successfulLoginRotatesToANewOpaqueSessionAndStoresOnlyHmac() {
        var login = auth.login(" PERSON@EXAMPLE.COM ", "Valid123!", "127.0.0.1");

        assertThat(login.next()).isEqualTo(AuthenticationFlowService.Next.SESSION);
        assertThat(login.sessionId()).isNotBlank().doesNotContain(".");
        var stored = jdbc.queryForObject("select encode(session_hash, 'hex') from sessions", String.class);
        assertThat(stored).doesNotContain(login.sessionId());
        assertThat(sessions.require(login.sessionId()).userId()).isEqualTo(userId);
        assertThat(login.toString()).doesNotContain("Bearer", "access_token", "refresh_token", "internal_token");
    }

    @Test
    void loginWaitsForTheUserSecurityLockBeforeIssuingASession() throws Exception {
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var statement = connection.prepareStatement("select id from users where id = ? for update")) {
                statement.setObject(1, userId);
                statement.executeQuery();
            }
            var login = executor.submit(
                    () -> auth.login("person@example.com", "Valid123!", "127.0.0.1"));

            assertThatThrownBy(() -> login.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            connection.commit();

            assertThat(login.get(10, TimeUnit.SECONDS).sessionId()).isNotBlank();
        }
    }

    @Test
    void unknownEmailAndWrongPasswordHaveTheSamePublicFailure() {
        var unknown = captureFailure("unknown@example.com", "Wrong123!");
        var wrong = captureFailure("person@example.com", "Wrong123!");
        assertThat(unknown).isEqualTo(wrong).isEqualTo("Email or password is invalid");
    }

    @Test
    void unknownLoginWaitsForTheIdentityKeyedLock() throws Exception {
        var identity = "unknown-lock@example.com";
        var lockKey = ByteBuffer.wrap(sha256(identity)).getLong();
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select pg_advisory_xact_lock(?)")) {
                lock.setLong(1, lockKey);
                lock.executeQuery();
            }

            var attempt = executor.submit(() -> captureFailure(identity, "Wrong123!"));
            assertThatThrownBy(() -> attempt.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            connection.commit();

            assertThat(attempt.get(10, TimeUnit.SECONDS))
                    .isEqualTo("Email or password is invalid");
        }
    }

    @Test
    void unknownPasswordResetWaitsForTheIdentityKeyedLock() throws Exception {
        var identity = "unknown-reset-lock@example.com";
        var lockKey = ByteBuffer.wrap(sha256(identity)).getLong();
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select pg_advisory_xact_lock(?)")) {
                lock.setLong(1, lockKey);
                lock.executeQuery();
            }

            var attempt = executor.submit(() -> auth.requestPasswordReset(identity));
            assertThatThrownBy(() -> attempt.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            connection.commit();

            assertThat(attempt.get(10, TimeUnit.SECONDS)).isNotNull();
        }
    }

    @Test
    void unknownReactivationWaitsForTheIdentityKeyedLock() throws Exception {
        var identity = "unknown-reactivation-lock@example.com";
        var lockKey = ByteBuffer.wrap(sha256(identity)).getLong();
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select pg_advisory_xact_lock(?)")) {
                lock.setLong(1, lockKey);
                lock.executeQuery();
            }

            var attempt = executor.submit(() -> auth.requestReactivation(identity, "Wrong123!"));
            assertThatThrownBy(() -> attempt.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            connection.commit();

            assertThat(attempt.get(10, TimeUnit.SECONDS)).isNotNull();
        }
    }

    @Test
    void accountAndIpThrottleBlocksEvenACorrectPasswordUntilTheDelayExpires() {
        assertThat(captureFailure("person@example.com", "Wrong123!"))
                .isEqualTo("Email or password is invalid");
        jdbc.update("update login_throttles set next_allowed_at = now() + interval '5 minutes'");

        assertThat(captureFailure("person@example.com", "Valid123!"))
                .isEqualTo("Email or password is invalid");
        assertThat(jdbc.queryForObject("select count(*) from sessions", Integer.class)).isZero();

        jdbc.update("update login_throttles set next_allowed_at = now() - interval '1 second'");
        assertThat(auth.login("person@example.com", "Valid123!", "127.0.0.1").sessionId())
                .isNotBlank();
    }

    @Test
    void queuedLoginAttemptsRecheckThrottleAfterTheIdentityLock() throws Exception {
        var identity = "person@example.com";
        var sourceIp = "127.0.0.1";
        var lockKey = ByteBuffer.wrap(sha256(identity)).getLong();
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newFixedThreadPool(2)) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select pg_advisory_xact_lock(?)")) {
                lock.setLong(1, lockKey);
                lock.executeQuery();
            }

            var first = executor.submit(() -> captureFailure(identity, "Wrong123!"));
            var second = executor.submit(() -> captureFailure(identity, "Wrong123!"));
            assertThatThrownBy(() -> first.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            assertThatThrownBy(() -> second.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            connection.commit();

            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo("Email or password is invalid");
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo("Email or password is invalid");
        }

        assertThat(jdbc.queryForObject("""
                select failure_count from login_throttles
                where identity_hash = ? and source_ip = ?::inet
                """, Integer.class, sha256(identity), sourceIp)).isOne();
    }

    @Test
    void failedLoginExpiresOnlyStaleThrottleIdentities() {
        jdbc.update("""
                insert into login_throttles(identity_hash, source_ip, last_failure_at)
                values (decode(repeat('11', 32), 'hex'), '192.0.2.10', now() - interval '25 hours'),
                       (decode(repeat('22', 32), 'hex'), '192.0.2.11', now() - interval '23 hours')
                """);

        assertThat(captureFailure("attacker-chosen@example.com", "Wrong123!"))
                .isEqualTo("Email or password is invalid");

        assertThat(jdbc.queryForObject("""
                select count(*) from login_throttles
                where identity_hash = decode(repeat('11', 32), 'hex')
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from login_throttles
                where identity_hash = decode(repeat('22', 32), 'hex')
                """, Integer.class)).isOne();
    }

    @Test
    void passwordChangeRevokesEveryExistingSession() {
        var first = auth.login("person@example.com", "Valid123!", "127.0.0.1").sessionId();
        var second = auth.login("person@example.com", "Valid123!", "127.0.0.2").sessionId();

        auth.changePassword(first, userId, "Valid123!", "Changed123!");

        assertThatThrownBy(() -> sessions.require(first)).isInstanceOf(AuthenticationException.class);
        assertThatThrownBy(() -> sessions.require(second)).isInstanceOf(AuthenticationException.class);
        assertThat(jdbc.queryForObject(
                "select count(*) from sessions where user_id = ? and revoked_at is null", Integer.class, userId))
                .isZero();
    }

    @Test
    void mandatoryPasswordRotationRejectsReusingTheStoredPassword() {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        jdbc.update("update credentials set must_change_password = true where user_id = ?", userId);
        var before = jdbc.queryForObject(
                "select password_hash from credentials where user_id = ?", String.class, userId);

        assertThatThrownBy(() -> auth.changePassword(
                session.sessionId(), userId, "Valid123!", "Valid123!"))
                .isInstanceOf(AuthenticationException.class);

        assertThat(jdbc.queryForObject(
                "select password_hash from credentials where user_id = ?", String.class, userId))
                .isEqualTo(before);
        assertThat(jdbc.queryForObject(
                "select must_change_password from credentials where user_id = ?", Boolean.class, userId))
                .isTrue();
        assertThat(sessions.require(session.sessionId()).userId()).isEqualTo(userId);
    }

    @Test
    void passwordResetCannotClearMandatoryRotationByReusingTheStoredPassword() throws Exception {
        jdbc.update("update credentials set must_change_password = true where user_id = ?", userId);
        var reset = auth.requestPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where flow_hash = ? and purpose = 'PASSWORD_RESET'
                """, sha256("654321"), sha256(reset.toString()));

        assertThatThrownBy(() -> auth.completePasswordReset(reset, "654321", "Valid123!"))
                .isInstanceOf(AuthenticationException.class);

        assertThat(jdbc.queryForObject(
                "select must_change_password from credentials where user_id = ?", Boolean.class, userId))
                .isTrue();
        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where flow_hash = ? and consumed_at is not null
                """, Integer.class, sha256(reset.toString()))).isOne();
    }

    @Test
    void repeatedCsrfReadsKeepTheSessionTokenValidAcrossTabs() {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);

        var firstTab = csrf.issue(session.sessionId());
        var secondTab = csrf.issue(session.sessionId());

        assertThat(firstTab).isEqualTo(secondTab);
        assertThat(csrf.matches(session.sessionId(), firstTab)).isTrue();
        assertThat(csrf.matches(session.sessionId(), secondTab)).isTrue();
    }

    @Test
    void expiredSessionRevocationRemainsCommittedAfterAuthenticationFailure() {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        jdbc.update("update sessions set idle_expires_at = now() - interval '1 second'");

        assertThatThrownBy(() -> sessions.require(session.sessionId()))
                .isInstanceOf(AuthenticationException.class);

        assertThat(jdbc.queryForObject("""
                select count(*) from sessions
                where user_id = ? and revoked_at is not null
                  and revocation_reason = 'EXPIRED_OR_INACTIVE'
                """, Integer.class, userId)).isOne();
    }

    @Test
    void concurrentPasswordChangesCanConsumeTheCurrentPasswordOnlyOnce() throws Exception {
        var firstSession = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT).sessionId();
        var secondSession = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT).sessionId();
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(
                    () -> attemptPasswordChange(firstSession, ready, start, "FirstChanged123!"));
            var second = executor.submit(
                    () -> attemptPasswordChange(secondSession, ready, start, "SecondChanged123!"));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            assertThat((first.get(30, TimeUnit.SECONDS) ? 1 : 0)
                    + (second.get(30, TimeUnit.SECONDS) ? 1 : 0)).isOne();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void passwordChangeResponseDeletesTheNowRevokedBrowserSession() throws Exception {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);

        mvc.perform(put("/api/v1/account/password")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                        .header("X-CSRF-Token", session.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"current_password":"Valid123!","new_password":"Changed123!"}
                                """))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(SessionCookieFactory.SESSION_COOKIE, 0));
    }

    @Test
    void deactivationVerifiesThePasswordAfterAcquiringTheUserLifecycleLock() throws Exception {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(post("/api/v1/account/deactivate")
                            .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                            .header("X-CSRF-Token", session.csrfToken())
                            .header("Origin", "https://localhost")
                            .header("Sec-Fetch-Site", "same-origin")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"password\":\"Valid123!\"}"))
                    .andReturn().getResponse().getStatus());

            assertThatThrownBy(() -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            var changed = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()
                    .encode("Changed123!");
            try (var update = connection.prepareStatement(
                    "update credentials set password_hash = ? where user_id = ?")) {
                update.setString(1, changed);
                update.setObject(2, userId);
                update.executeUpdate();
            }
            connection.commit();

            assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(401);
        }

        assertThat(jdbc.queryForObject("select state from users where id = ?", String.class, userId))
                .isEqualTo("ACTIVE");
    }

    @Test
    void deactivationRevalidatesTheSessionAfterWaitingForTheUserLock() throws Exception {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(post("/api/v1/account/deactivate")
                            .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                            .header("X-CSRF-Token", session.csrfToken())
                            .header("Origin", "https://localhost")
                            .header("Sec-Fetch-Site", "same-origin")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"password\":\"Valid123!\"}"))
                    .andReturn().getResponse().getStatus());

            assertThatThrownBy(() -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                        update sessions set revoked_at = now(), revocation_reason = 'LOGOUT'
                        where session_hash = ? and revoked_at is null
                    """)) {
                revoke.setBytes(1, sessions.hmac(session.sessionId()));
                assertThat(revoke.executeUpdate()).isOne();
            }
            connection.commit();

            assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(401);
        }

        assertThat(jdbc.queryForObject("select state from users where id = ?", String.class, userId))
                .isEqualTo("ACTIVE");
    }

    @Test
    void passwordChangeRevalidatesActiveStateAfterAcquiringTheUserLifecycleLock() throws Exception {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(put("/api/v1/account/password")
                            .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                            .header("X-CSRF-Token", session.csrfToken())
                            .header("Origin", "https://localhost")
                            .header("Sec-Fetch-Site", "same-origin")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"current_password":"Valid123!","new_password":"Changed123!"}
                                    """))
                    .andReturn().getResponse().getStatus());

            assertThatThrownBy(() -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var update = connection.prepareStatement(
                    "update users set state = 'DEACTIVATED' where id = ?")) {
                update.setObject(1, userId);
                update.executeUpdate();
            }
            connection.commit();

            assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(401);
        }

        var encoded = jdbc.queryForObject(
                "select password_hash from credentials where user_id = ?", String.class, userId);
        assertThat(Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()
                        .matches("Valid123!", encoded))
                .isTrue();
    }

    @Test
    void passwordChangeRevalidatesTheSessionAfterWaitingForTheUserLock() throws Exception {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(put("/api/v1/account/password")
                            .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                            .header("X-CSRF-Token", session.csrfToken())
                            .header("Origin", "https://localhost")
                            .header("Sec-Fetch-Site", "same-origin")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"current_password":"Valid123!","new_password":"Changed123!"}
                                    """))
                    .andReturn().getResponse().getStatus());

            assertThatThrownBy(() -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                        update sessions set revoked_at = now(), revocation_reason = 'LOGOUT_ALL'
                        where user_id = ? and revoked_at is null
                    """)) {
                revoke.setObject(1, userId);
                assertThat(revoke.executeUpdate()).isOne();
            }
            connection.commit();

            assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(401);
        }

        var encoded = jdbc.queryForObject(
                "select password_hash from credentials where user_id = ?", String.class, userId);
        assertThat(Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()
                        .matches("Valid123!", encoded))
                .isTrue();
    }

    @Test
    void logoutAllRevalidatesTheInitiatingSessionAfterWaitingForTheUserLock() throws Exception {
        var initiating = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        var other = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }

            var response = executor.submit(
                    () -> sessions.revokeAllFromSession(initiating.sessionId(), "LOGOUT_ALL"));

            assertThatThrownBy(() -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                    update sessions set revoked_at = now(), revocation_reason = 'LOGOUT'
                    where session_hash = ? and revoked_at is null
                    """)) {
                revoke.setBytes(1, sessions.hmac(initiating.sessionId()));
                assertThat(revoke.executeUpdate()).isOne();
            }
            connection.commit();

            assertThatThrownBy(() -> response.get(10, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(sessions.require(other.sessionId()).userId()).isEqualTo(userId);
    }

    @Test
    void disablingTwoFactorDeletesTheNowRevokedBrowserSession() throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);

        mvc.perform(post("/api/v1/account/2fa/disable")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                        .header("X-CSRF-Token", session.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"password":"Valid123!"}
                                """))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(SessionCookieFactory.SESSION_COOKIE, 0));
    }

    @Test
    void disablingTwoFactorConsumesPendingLoginAndEnableChallenges() throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var pendingLogin = auth.login("person@example.com", "Valid123!", "127.0.0.1");
        var pendingEnable = requestTwoFactorEnable();
        var enablingSession = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose in ('TWO_FACTOR', 'TWO_FACTOR_ENABLE')
                  and consumed_at is null
                """, sha256("123456"), userId);

        auth.disableTwoFactor(enablingSession.sessionId(), userId, "Valid123!");

        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where user_id = ? and purpose in ('TWO_FACTOR', 'TWO_FACTOR_ENABLE')
                  and consumed_at is null
                """, Integer.class, userId)).isZero();
        assertThatThrownBy(() -> auth.verifyTwoFactor(
                UUID.fromString(pendingLogin.authFlowId()), "123456"))
                .isInstanceOf(AuthenticationException.class);
        assertThatThrownBy(() -> auth.enableTwoFactor(
                enablingSession.sessionId(), userId, pendingEnable, "123456"))
                .isInstanceOf(AuthenticationException.class);
    }

    @Test
    void enablingTwoFactorWaitsForLogoutAndRejectsTheRevokedSession() throws Exception {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        var flow = auth.requestTwoFactorEnable(
                session.sessionId(), userId, "person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'TWO_FACTOR_ENABLE' and consumed_at is null
                """, sha256("123456"), userId);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("""
                    select session_hash from sessions
                    where user_id = ? and revoked_at is null for update
                    """)) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }

            var enable = executor.submit(
                    () -> auth.enableTwoFactor(session.sessionId(), userId, flow, "123456"));
            assertThatThrownBy(() -> enable.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                    update sessions set revoked_at = now(), revocation_reason = 'LOGOUT'
                    where user_id = ? and revoked_at is null
                    """)) {
                revoke.setObject(1, userId);
                assertThat(revoke.executeUpdate()).isOne();
            }
            connection.commit();

            assertThatThrownBy(() -> enable.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(jdbc.queryForObject(
                "select two_factor_enabled from credentials where user_id = ?",
                Boolean.class,
                userId)).isFalse();
    }

    @Test
    void requestingTwoFactorEnableWaitsForLogoutAndCreatesNoChallenge() throws Exception {
        var challengesBefore = count("auth_challenges");
        var notificationsBefore = count("notification_outbox");
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("""
                    select session_hash from sessions
                    where user_id = ? and revoked_at is null for update
                    """)) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }

            var request = executor.submit(() -> auth.requestTwoFactorEnable(
                    session.sessionId(), userId, "person@example.com"));
            assertThatThrownBy(() -> request.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                    update sessions set revoked_at = now(), revocation_reason = 'LOGOUT'
                    where user_id = ? and revoked_at is null
                    """)) {
                revoke.setObject(1, userId);
                assertThat(revoke.executeUpdate()).isOne();
            }
            connection.commit();

            assertThatThrownBy(() -> request.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(count("auth_challenges")).isEqualTo(challengesBefore);
        assertThat(count("notification_outbox")).isEqualTo(notificationsBefore);
    }

    @Test
    void disablingTwoFactorWaitsForLogoutAndRejectsTheRevokedSession() throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("""
                    select session_hash from sessions
                    where user_id = ? and revoked_at is null for update
                    """)) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }

            var disable = executor.submit(
                    () -> auth.disableTwoFactor(session.sessionId(), userId, "Valid123!"));
            assertThatThrownBy(() -> disable.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                    update sessions set revoked_at = now(), revocation_reason = 'LOGOUT'
                    where user_id = ? and revoked_at is null
                    """)) {
                revoke.setObject(1, userId);
                assertThat(revoke.executeUpdate()).isOne();
            }
            connection.commit();

            assertThatThrownBy(() -> disable.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(jdbc.queryForObject(
                "select two_factor_enabled from credentials where user_id = ?",
                Boolean.class,
                userId)).isTrue();
    }

    @Test
    void disablingTwoFactorRevalidatesActiveStateAfterAcquiringTheUserLifecycleLock()
            throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(post("/api/v1/account/2fa/disable")
                            .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                            .header("X-CSRF-Token", session.csrfToken())
                            .header("Origin", "https://localhost")
                            .header("Sec-Fetch-Site", "same-origin")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"password":"Valid123!"}
                                    """))
                    .andReturn().getResponse().getStatus());

            assertThatThrownBy(() -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var update = connection.prepareStatement(
                    "update users set state = 'DEACTIVATED' where id = ?")) {
                update.setObject(1, userId);
                update.executeUpdate();
            }
            connection.commit();

            assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(401);
        }

        assertThat(jdbc.queryForObject(
                "select two_factor_enabled from credentials where user_id = ?",
                Boolean.class,
                userId)).isTrue();
    }

    @Test
    void enablingTwoFactorWaitsForTheUserSecurityLockAndCannotOverrideDisable() throws Exception {
        var pendingEnable = requestTwoFactorEnable();
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'TWO_FACTOR_ENABLE' and consumed_at is null
                """, sha256("123456"), userId);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var enable = executor.submit(() -> auth.enableTwoFactor(
                    session.sessionId(), userId, pendingEnable, "123456"));

            assertThatThrownBy(() -> enable.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var disable = connection.prepareStatement("""
                        update credentials set two_factor_enabled = false,
                            two_factor_secret_ciphertext = null where user_id = ?
                    """);
                    var consume = connection.prepareStatement("""
                        update auth_challenges set consumed_at = now()
                        where user_id = ? and purpose = 'TWO_FACTOR_ENABLE' and consumed_at is null
                    """)) {
                disable.setObject(1, userId);
                disable.executeUpdate();
                consume.setObject(1, userId);
                consume.executeUpdate();
            }
            connection.commit();

            assertThatThrownBy(() -> enable.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(jdbc.queryForObject(
                "select two_factor_enabled from credentials where user_id = ?",
                Boolean.class, userId)).isFalse();
    }

    @Test
    void enablingTwoFactorRejectsASessionRevokedWhileWaitingForTheUserLock() throws Exception {
        var pendingEnable = requestTwoFactorEnable();
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'TWO_FACTOR_ENABLE' and consumed_at is null
                """, sha256("123456"), userId);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var enable = executor.submit(() -> auth.enableTwoFactor(
                    session.sessionId(), userId, pendingEnable, "123456"));

            assertThatThrownBy(() -> enable.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                        update sessions set revoked_at = now(), revocation_reason = 'PASSWORD_CHANGED'
                        where user_id = ? and revoked_at is null
                    """)) {
                revoke.setObject(1, userId);
                revoke.executeUpdate();
            }
            connection.commit();

            assertThatThrownBy(() -> enable.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(jdbc.queryForObject(
                "select two_factor_enabled from credentials where user_id = ?",
                Boolean.class, userId)).isFalse();
    }

    @Test
    void requestingTwoFactorEnableWaitsForPrivacyDeletionAndDoesNotRestoreIdentity() throws Exception {
        var challengesBefore = count("auth_challenges");
        var notificationsBefore = count("notification_outbox");
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var request = executor.submit(this::requestTwoFactorEnable);

            assertThatThrownBy(() -> request.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var deleted = connection.prepareStatement("""
                        update users set email = ?, normalized_email = ?, state = 'DELETED', deleted_at = now()
                        where id = ?
                    """)) {
                var anonymized = "deleted+" + userId + "@invalid.local";
                deleted.setString(1, anonymized);
                deleted.setString(2, anonymized);
                deleted.setObject(3, userId);
                deleted.executeUpdate();
            }
            connection.commit();

            assertThatThrownBy(() -> request.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }

        assertThat(count("auth_challenges")).isEqualTo(challengesBefore);
        assertThat(count("notification_outbox")).isEqualTo(notificationsBefore);
    }

    @Test
    void twoFactorResendRefreshesTheAuthenticationFlowCookie() throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var login = auth.login("person@example.com", "Valid123!", "127.0.0.1");
        jdbc.update(
                """
                update auth_challenges set last_sent_at = now() - interval '2 minutes'
                where user_id = ? and purpose = 'TWO_FACTOR' and consumed_at is null
                """,
                userId);

        mvc.perform(post("/api/v1/auth/2fa/resend")
                        .cookie(new Cookie(SessionCookieFactory.AUTH_FLOW_COOKIE, login.authFlowId()))
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isAccepted())
                .andExpect(cookie().maxAge(SessionCookieFactory.AUTH_FLOW_COOKIE, 600));
    }

    @Test
    void passwordResetInvalidatesAPendingTwoFactorLoginChallenge() throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var pendingLogin = auth.login("person@example.com", "Valid123!", "127.0.0.1");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'TWO_FACTOR' and consumed_at is null
                """, sha256("123456"), userId);
        var reset = auth.requestPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, sha256("654321"), userId);

        auth.completePasswordReset(reset, "654321", "Changed123!");

        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where user_id = ? and purpose = 'TWO_FACTOR' and consumed_at is null
                """, Integer.class, userId)).isZero();
        assertThatThrownBy(() -> auth.verifyTwoFactor(
                UUID.fromString(pendingLogin.authFlowId()), "123456"))
                .isInstanceOf(AuthenticationException.class);
    }

    @Test
    void authenticatedPasswordChangeConsumesPendingPasswordResetChallenges() throws Exception {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        var reset = auth.requestPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, sha256("654321"), userId);

        auth.changePassword(session.sessionId(), userId, "Valid123!", "Changed123!");

        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, Integer.class, userId)).isZero();
        assertThatThrownBy(() -> auth.completePasswordReset(reset, "654321", "Attacker123!"))
                .isInstanceOf(AuthenticationException.class);
    }

    @Test
    void completedPasswordResetConsumesEverySiblingResetChallenge() throws Exception {
        var first = auth.requestPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where flow_hash = ? and purpose = 'PASSWORD_RESET'
                """, sha256("123456"), sha256(first.toString()));
        var sibling = UUID.randomUUID();
        jdbc.update("""
                insert into auth_challenges(
                    flow_hash, user_id, purpose, target_identity, code_hash,
                    expires_at, last_sent_at, resend_window_started_at
                ) values (?, ?, 'PASSWORD_RESET', 'person@example.com', ?,
                          now() + interval '10 minutes', now(), now())
                """, sha256(sibling.toString()), userId, sha256("654321"));

        auth.completePasswordReset(first, "123456", "Changed123!");

        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, Integer.class, userId)).isZero();
        assertThatThrownBy(() -> auth.completePasswordReset(sibling, "654321", "Attacker123!"))
                .isInstanceOf(AuthenticationException.class);
    }

    @Test
    void ragAdministratorRoleSurvivesLoginInsteadOfCollapsingToParticipant() {
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'RAG_OPERATOR'
                """, userId);

        var login = auth.login("person@example.com", "Valid123!", "127.0.0.1");

        assertThat(login.role()).isEqualTo(SessionService.SessionRole.RAG_ADMIN);
        assertThat(sessions.require(login.sessionId()).role())
                .isEqualTo(SessionService.SessionRole.RAG_ADMIN);
    }

    @Test
    void reactivationRequiresTheDeactivatedAccountsCurrentPasswordBeforeSendingEmail() {
        clearInvocations(codeProtector);
        jdbc.update("update users set state = 'DEACTIVATED', deactivated_at = now() where id = ?", userId);
        var challengesBefore = count("auth_challenges");
        var notificationsBefore = count("notification_outbox");

        var fakeFlow = auth.requestReactivation("person@example.com", "Wrong123!");

        assertThat(fakeFlow).isNotNull();
        assertThat(count("auth_challenges")).isEqualTo(challengesBefore);
        assertThat(count("notification_outbox")).isEqualTo(notificationsBefore);

        var realFlow = auth.requestReactivation("person@example.com", "Valid123!");

        assertThat(realFlow).isNotNull().isNotEqualTo(fakeFlow);
        assertThat(count("auth_challenges")).isEqualTo(challengesBefore + 1);
        assertThat(count("notification_outbox")).isEqualTo(notificationsBefore + 1);
        verify(smtp, never()).sendChallenge(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                eq("REACTIVATION"));
        verify(codeProtector, times(2)).protect(challengeCode());
    }

    @Test
    void reactivationCompletionLocksTheUserBeforeConsumingItsChallenge() throws Exception {
        jdbc.update("update users set state = 'DEACTIVATED', deactivated_at = now() where id = ?", userId);
        var flow = auth.requestReactivation("person@example.com", "Valid123!");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'REACTIVATION' and consumed_at is null
                """, sha256("123456"), userId);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            connection.createStatement().execute("set local lock_timeout = '500ms'");
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var completion = executor.submit(() -> auth.completeReactivation(flow, "123456"));

            assertThatThrownBy(() -> completion.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var delete = connection.prepareStatement("""
                        delete from auth_challenges
                        where user_id = ? and purpose = 'REACTIVATION'
                    """)) {
                delete.setObject(1, userId);
                assertThat(delete.executeUpdate()).isOne();
            }
            connection.commit();

            assertThatThrownBy(() -> completion.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }
    }

    @Test
    void requestingReactivationWaitsForPrivacyDeletionAndDoesNotRestoreIdentity() throws Exception {
        jdbc.update("update users set state = 'DEACTIVATED', deactivated_at = now() where id = ?", userId);
        var challengesBefore = count("auth_challenges");
        var notificationsBefore = count("notification_outbox");
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var request = executor.submit(
                    () -> auth.requestReactivation("person@example.com", "Valid123!"));

            assertThatThrownBy(() -> request.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var deleted = connection.prepareStatement("""
                        update users set email = ?, normalized_email = ?, state = 'DELETED', deleted_at = now()
                        where id = ?
                    """)) {
                var anonymized = "deleted+" + userId + "@invalid.local";
                deleted.setString(1, anonymized);
                deleted.setString(2, anonymized);
                deleted.setObject(3, userId);
                deleted.executeUpdate();
            }
            connection.commit();

            assertThat(request.get(10, TimeUnit.SECONDS)).isNotNull();
        }

        assertThat(count("auth_challenges")).isEqualTo(challengesBefore);
        assertThat(count("notification_outbox")).isEqualTo(notificationsBefore);
    }

    @Test
    void passwordResetQueuesDeliveryWhileTwoFactorStillDeliversSynchronously() {
        auth.requestPasswordReset("person@example.com");
        requestTwoFactorEnable();

        assertThat(jdbc.queryForObject("""
                select count(*) from notification_outbox
                where event_type = 'PASSWORD_RESET'
                  and attempt_count = 0 and delivered_at is null
                """, Integer.class)).isOne();
        verify(smtp, never()).sendChallenge(
                eq("person@example.com"), challengeCode(), eq("PASSWORD_RESET"));
        verify(smtp).sendChallenge(
                eq("person@example.com"), challengeCode(), eq("TWO_FACTOR_ENABLE"));
    }

    @Test
    void knownAndUnknownPasswordResetRequestsAreBothAcceptedWithoutSynchronousSmtp() {
        clearInvocations(codeProtector);
        var known = auth.requestPasswordReset("person@example.com");
        var unknown = auth.requestPasswordReset("unknown@example.com");

        assertThat(known).isNotNull();
        assertThat(unknown).isNotNull().isNotEqualTo(known);
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_outbox
                where event_type = 'PASSWORD_RESET' and attempt_count = 0
                  and delivered_at is null and last_error_code is null
                """, Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where purpose = 'PASSWORD_RESET' and consumed_at is null
                """, Integer.class)).isEqualTo(1);
        verify(smtp, never()).sendChallenge(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(), eq("PASSWORD_RESET"));
        verify(codeProtector, times(2)).protect(challengeCode());
    }

    @Test
    void replacingPasswordResetChallengeRetiresThePreviouslyQueuedMail() {
        auth.requestPasswordReset("person@example.com");

        auth.requestPasswordReset("person@example.com");

        assertThat(jdbc.queryForObject("""
                select count(*) from notification_outbox
                where event_type = 'PASSWORD_RESET' and delivered_at is null
                  and attempt_count = 0 and last_error_code is null
                """, Integer.class)).isOne();
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_outbox
                where event_type = 'PASSWORD_RESET' and delivered_at is not null
                  and last_error_code = 'CHALLENGE_SUPERSEDED'
                """, Integer.class)).isOne();
        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where purpose = 'PASSWORD_RESET' and consumed_at is null
                """, Integer.class)).isOne();
    }

    @Test
    void fakeAndRealAuthenticationFlowsExposeTheSameInvalidCodeFailure() {
        var fakeReset = auth.requestPasswordReset("unknown@example.com");
        var realReset = auth.requestPasswordReset("person@example.com");

        assertThat(captureAuthenticationFailure(
                        () -> auth.completePasswordReset(fakeReset, "000000", "Changed123!")))
                .isEqualTo(captureAuthenticationFailure(
                        () -> auth.completePasswordReset(realReset, "000000", "Changed123!")));

        jdbc.update("update users set state = 'DEACTIVATED', deactivated_at = now() where id = ?", userId);
        var fakeReactivation = auth.requestReactivation("person@example.com", "Wrong123!");
        var realReactivation = auth.requestReactivation("person@example.com", "Valid123!");

        assertThat(captureAuthenticationFailure(
                        () -> auth.completeReactivation(fakeReactivation, "000000")))
                .isEqualTo(captureAuthenticationFailure(
                        () -> auth.completeReactivation(realReactivation, "000000")));
    }

    @Test
    void fakeFlowCompletionSerializesAndPersistsOpaqueAttemptWork() throws Exception {
        var fakeFlow = auth.requestPasswordReset("unknown@example.com");
        var lockKey = ByteBuffer.wrap(sha256(
                "opaque-completion\0PASSWORD_RESET\0" + fakeFlow)).getLong();

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select pg_advisory_xact_lock(?)")) {
                lock.setLong(1, lockKey);
                lock.executeQuery();
            }

            var completion = executor.submit(() -> captureAuthenticationFailure(
                    () -> auth.completePasswordReset(fakeFlow, "000000", "Changed123!")));
            assertThatThrownBy(() -> completion.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            connection.commit();

            assertThat(completion.get(10, TimeUnit.SECONDS))
                    .isEqualTo("Authentication code is invalid");
        }

        assertThat(jdbc.queryForObject("""
                select sum(attempt_count) from auth_challenges
                where purpose = 'OPAQUE_COMPLETION'
                """, Integer.class)).isOne();
    }

    @Test
    void invalidAuthenticationCodeAttemptRemainsCommitted() {
        var flow = auth.requestPasswordReset("person@example.com");

        assertThatThrownBy(() -> auth.completePasswordReset(flow, "wrong-code", "Changed123!"))
                .isInstanceOf(AuthenticationException.class);

        assertThat(jdbc.queryForObject("""
                select attempt_count from auth_challenges
                where flow_hash is not null and purpose = 'PASSWORD_RESET'
                """, Integer.class)).isOne();
    }

    @Test
    void reactivationDoesNotCreateAChallengeForAnActiveOrDeletedAccount() {
        var challengesBefore = count("auth_challenges");

        auth.requestReactivation("person@example.com", "Valid123!");
        jdbc.update("update users set state = 'DELETED', deleted_at = now() where id = ?", userId);
        auth.requestReactivation("person@example.com", "Valid123!");

        assertThat(count("auth_challenges")).isEqualTo(challengesBefore);
    }

    private UUID requestTwoFactorEnable() {
        var session = sessions.issue(userId, SessionService.SessionRole.PARTICIPANT);
        return auth.requestTwoFactorEnable(
                session.sessionId(), userId, "person@example.com");
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    private String captureAuthenticationFailure(Runnable operation) {
        try {
            operation.run();
            throw new AssertionError("Expected authentication to fail");
        } catch (AuthenticationException expected) {
            return expected.getMessage();
        }
    }

    private String captureFailure(String email, String password) {
        try {
            auth.login(email, password, "127.0.0.1");
            throw new AssertionError("Expected authentication to fail");
        } catch (AuthenticationException expected) {
            return expected.getMessage();
        }
    }

    private String challengeCode() {
        return org.mockito.ArgumentMatchers.argThat(value -> value != null && value.matches("\\d{6}"));
    }

    private boolean attemptPasswordChange(
            String sessionId, CountDownLatch ready, CountDownLatch start, String newPassword)
            throws InterruptedException {
        ready.countDown();
        if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("password race did not start");
        try {
            auth.changePassword(sessionId, userId, "Valid123!", newPassword);
            return true;
        } catch (AuthenticationException expected) {
            return false;
        }
    }

    private byte[] sha256(String value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
    }
}
