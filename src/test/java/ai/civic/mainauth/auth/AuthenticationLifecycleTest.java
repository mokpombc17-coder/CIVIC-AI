package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
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
import org.springframework.test.web.servlet.ResultActions;
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
        "civic.auth.hmac-secret=test-auth-hmac-secret-with-at-least-32-bytes"
})
@AutoConfigureMockMvc
class AuthenticationLifecycleTest extends PostgresIntegrationTest {
    @Autowired AuthenticationFlowService auth;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired PwaRefreshTokenService pwaRefreshTokens;
    @Autowired AccessCredentialTestFactory credentials;
    @Autowired AuthCredentialHashing credentialHashing;
    @Autowired AuthenticatedUserService authenticatedUsers;
    @Autowired CsrfService csrf;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @MockitoBean SmtpNotificationService smtp;
    @MockitoSpyBean VerificationCodeProtector codeProtector;

    private UUID userId;

    @BeforeEach
    void createActiveParticipant() {
        jdbc.update("delete from pwa_refresh_sessions");
        jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from login_throttles");
        jdbc.update("delete from pre_session_rate_limits");
        jdbc.update("delete from auth_challenge_send_limits");
        jdbc.update("delete from opaque_auth_flows");
        jdbc.update("delete from notification_outbox");
        jdbc.update("delete from auth_challenges");
        jdbc.update("delete from account_state_outbox where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from credentials where user_id in (select id from users where origin = 'SIGNUP')");
        jdbc.update("delete from user_permissions where user_id in (select id from users where origin = 'SIGNUP')");
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
    void loginWaitsForTheUserSecurityLockBeforeAuthenticating() throws Exception {
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

            assertThat(login.get(10, TimeUnit.SECONDS).userId()).isEqualTo(userId);
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
        assertThat(jdbc.queryForObject("select count(*) from refresh_tokens", Integer.class)).isZero();

        jdbc.update("update login_throttles set next_allowed_at = now() - interval '1 second'");
        assertThat(auth.login("person@example.com", "Valid123!", "127.0.0.1").userId())
                .isEqualTo(userId);
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
    void passwordChangeRevokesEveryExistingRefreshToken() {
        refreshTokens.issue(userId);
        refreshTokens.issue(userId);
        pwaRefreshTokens.issue(userId);

        auth.changePassword(userId, "Valid123!", "Changed123!");

        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ? and revoked_at is null",
                Integer.class, userId)).isZero();
        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ? and revocation_reason = 'PASSWORD_CHANGED'",
                Integer.class, userId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("""
                select count(*) from pwa_refresh_sessions
                where user_id = ? and revocation_reason = 'PASSWORD_CHANGED'
                """, Integer.class, userId)).isOne();
    }

    @Test
    void mandatoryPasswordRotationRejectsReusingTheStoredPassword() {
        refreshTokens.issue(userId);
        jdbc.update("update credentials set must_change_password = true where user_id = ?", userId);
        var before = jdbc.queryForObject(
                "select password_hash from credentials where user_id = ?", String.class, userId);

        assertThatThrownBy(() -> auth.changePassword(
                userId, "Valid123!", "Valid123!"))
                .isInstanceOf(AuthenticationException.class);

        assertThat(jdbc.queryForObject(
                "select password_hash from credentials where user_id = ?", String.class, userId))
                .isEqualTo(before);
        assertThat(jdbc.queryForObject(
                "select must_change_password from credentials where user_id = ?", Boolean.class, userId))
                .isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ? and revoked_at is null",
                Integer.class, userId)).isOne();
    }

    @Test
    void mandatoryPasswordRotationCanOnlyUseThePasswordChangeAccountFlow() throws Exception {
        jdbc.update("update credentials set must_change_password = true where user_id = ?", userId);
        var credential = credentials.issue(userId);

        mvc.perform(get("/api/v1/account/profile")
                        .cookie(new Cookie(
                                AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken())))
                .andExpect(status().isForbidden());

        mvc.perform(put("/api/v1/account/password")
                        .cookie(new Cookie(
                                AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                        .header("X-CSRF-Token", credential.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"current_password":"Valid123!","new_password":"Changed123!"}
                                """))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/auth/me")
                        .cookie(new Cookie(
                                AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.must_change_password").value(true));
        mvc.perform(get("/api/v1/account/profile")
                        .cookie(new Cookie(
                                AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken())))
                .andExpect(status().isForbidden());
    }

    @Test
    void passwordResetCannotClearMandatoryRotationByReusingTheStoredPassword() throws Exception {
        jdbc.update("update credentials set must_change_password = true where user_id = ?", userId);
        var reset = auth.requestPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where flow_hash = ? and purpose = 'PASSWORD_RESET'
                """, codeProtector.verifier("654321"), sha256(reset.toString()));

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
    void repeatedCsrfReadsRemainStableForOneAccessTokenAcrossTabs() {
        var credential = credentials.issue(userId);

        var firstTab = csrf.issue(credential.user());
        var secondTab = csrf.issue(credential.user());

        assertThat(firstTab).isEqualTo(secondTab);
        assertThat(csrf.matches(credential.user(), firstTab)).isTrue();
        assertThat(csrf.matches(credential.user(), secondTab)).isTrue();
    }

    @Test
    void concurrentPasswordChangesCanConsumeTheCurrentPasswordOnlyOnce() throws Exception {
         var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(
                    () -> attemptPasswordChange(ready, start, "FirstChanged123!"));
            var second = executor.submit(
                    () -> attemptPasswordChange(ready, start, "SecondChanged123!"));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            assertThat((first.get(30, TimeUnit.SECONDS) ? 1 : 0)
                    + (second.get(30, TimeUnit.SECONDS) ? 1 : 0)).isOne();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void passwordChangeResponseDeletesBothBrowserCredentials() throws Exception {
        var credential = credentials.issue(userId);

        mvc.perform(put("/api/v1/account/password")
                        .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                        .header("X-CSRF-Token", credential.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"current_password":"Valid123!","new_password":"Changed123!"}
                                """))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(AuthCookieFactory.ACCESS_TOKEN_COOKIE, 0))
                .andExpect(cookie().maxAge(AuthCookieFactory.REFRESH_TOKEN_COOKIE, 0));
    }

    @Test
    void deactivationVerifiesThePasswordAfterAcquiringTheUserLifecycleLock() throws Exception {
        var credential = credentials.issue(userId);
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(post("/api/v1/account/deactivate")
                            .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                            .header("X-CSRF-Token", credential.csrfToken())
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
    void passwordChangeRevalidatesActiveStateAfterAcquiringTheUserLifecycleLock() throws Exception {
        var credential = credentials.issue(userId);
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(put("/api/v1/account/password")
                            .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                            .header("X-CSRF-Token", credential.csrfToken())
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
    void disablingTwoFactorDeletesBothBrowserCredentials() throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var credential = credentials.issue(userId);

        mvc.perform(post("/api/v1/account/2fa/disable")
                        .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                        .header("X-CSRF-Token", credential.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"password":"Valid123!"}
                                """))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(AuthCookieFactory.ACCESS_TOKEN_COOKIE, 0))
                .andExpect(cookie().maxAge(AuthCookieFactory.REFRESH_TOKEN_COOKIE, 0));
    }

    @Test
    void disablingTwoFactorConsumesPendingLoginAndEnableChallenges() throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var pendingLogin = auth.login("person@example.com", "Valid123!", "127.0.0.1");
        var pendingEnable = requestTwoFactorEnable();
         jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose in ('TWO_FACTOR', 'TWO_FACTOR_ENABLE')
                  and consumed_at is null
                """, codeProtector.verifier("123456"), userId);

        auth.disableTwoFactor(userId, "Valid123!");

        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where user_id = ? and purpose in ('TWO_FACTOR', 'TWO_FACTOR_ENABLE')
                  and consumed_at is null
                """, Integer.class, userId)).isZero();
        assertThatThrownBy(() -> auth.verifyTwoFactor(
                UUID.fromString(pendingLogin.authFlowId()), "123456"))
                .isInstanceOf(AuthenticationException.class);
        assertThatThrownBy(() -> auth.enableTwoFactor(
                userId, pendingEnable, "123456"))
                .isInstanceOf(AuthenticationException.class);
    }

    @Test
    void disablingTwoFactorRevalidatesActiveStateAfterAcquiringTheUserLifecycleLock()
            throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var credential = credentials.issue(userId);
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(post("/api/v1/account/2fa/disable")
                            .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                            .header("X-CSRF-Token", credential.csrfToken())
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
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'TWO_FACTOR_ENABLE' and consumed_at is null
                """, codeProtector.verifier("123456"), userId);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }
            var enable = executor.submit(() -> auth.enableTwoFactor(
                    userId, pendingEnable, "123456"));

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
                        .cookie(new Cookie(AuthCookieFactory.AUTH_FLOW_COOKIE, login.authFlowId()))
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isAccepted())
                .andExpect(cookie().maxAge(AuthCookieFactory.AUTH_FLOW_COOKIE, 600));
    }

    @Test
    void passwordResetInvalidatesAPendingTwoFactorLoginChallenge() throws Exception {
        jdbc.update("update credentials set two_factor_enabled = true where user_id = ?", userId);
        var pendingLogin = auth.login("person@example.com", "Valid123!", "127.0.0.1");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'TWO_FACTOR' and consumed_at is null
                """, codeProtector.verifier("123456"), userId);
        var reset = auth.requestPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, codeProtector.verifier("654321"), userId);

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
        var reset = auth.requestPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, codeProtector.verifier("654321"), userId);

        auth.changePassword(userId, "Valid123!", "Changed123!");

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
                """, codeProtector.verifier("123456"), sha256(first.toString()));
        var sibling = UUID.randomUUID();
        jdbc.update("""
                insert into auth_challenges(
                    flow_hash, user_id, purpose, target_identity, code_hash,
                    expires_at, last_sent_at, resend_window_started_at
                ) values (?, ?, 'PASSWORD_RESET', 'person@example.com', ?,
                          now() + interval '10 minutes', now(), now())
                """, sha256(sibling.toString()), userId, codeProtector.verifier("654321"));

        auth.completePasswordReset(first, "123456", "Changed123!");

        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, Integer.class, userId)).isZero();
        assertThatThrownBy(() -> auth.completePasswordReset(sibling, "654321", "Attacker123!"))
                .isInstanceOf(AuthenticationException.class);
    }

    @Test
    void ragAdministratorPermissionSurvivesLoginWithoutBecomingAnIndependentRole() {
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'ADMIN'
                """, userId);
        jdbc.update("""
                insert into user_permissions(user_id, permission_id)
                select ?, id from permissions where code = 'RAG_ADMIN'
                """, userId);

        var login = auth.login("person@example.com", "Valid123!", "127.0.0.1");

        assertThat(login.role()).isEqualTo(AuthenticatedUserService.UserRole.ADMIN);
        assertThat(authenticatedUsers.current(userId).role())
                .isEqualTo(AuthenticatedUserService.UserRole.ADMIN);
        assertThat(authenticatedUsers.current(userId).permissions()).containsExactly("RAG_ADMIN");
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
                """, codeProtector.verifier("123456"), userId);

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
    void replacingPasswordResetLocksTheChallengeBeforeItsQueuedMail() throws Exception {
        auth.requestPasswordReset("person@example.com");
        var challengeId = jdbc.queryForObject("""
                select id from auth_challenges
                where user_id = ? and purpose = 'PASSWORD_RESET' and consumed_at is null
                """, UUID.class, userId);
        var notificationId = jdbc.queryForObject("""
                select id from notification_outbox
                where payload ->> 'challenge_id' = ? and delivered_at is null
                """, UUID.class, challengeId.toString());

        try (var executor = Executors.newSingleThreadExecutor();
                var connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (var notificationLock = connection.prepareStatement(
                    "select id from notification_outbox where id = ? for update")) {
                notificationLock.setObject(1, notificationId);
                notificationLock.executeQuery();
            }

            var replacement = executor.submit(
                    () -> auth.requestPasswordReset("person@example.com"));
            assertThatThrownBy(() -> replacement.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);

            try (var challengeLock = connection.prepareStatement(
                    "select id from auth_challenges where id = ? for update nowait")) {
                challengeLock.setObject(1, challengeId);
                assertThatThrownBy(challengeLock::executeQuery)
                        .isInstanceOf(java.sql.SQLException.class)
                        .extracting(error -> ((java.sql.SQLException) error).getSQLState())
                        .isEqualTo("55P03");
            }
            connection.rollback();

            assertThat(replacement.get(10, TimeUnit.SECONDS)).isNotNull();
        }
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
    void fakeFlowCompletionsForOneIdentitySerializeAndPersistOpaqueAttemptWork() throws Exception {
        var identity = "unknown-completion@example.com";
        var firstFakeFlow = auth.requestPasswordReset(identity);
        var secondFakeFlow = auth.requestPasswordReset(identity);
        var lockKey = ByteBuffer.wrap(credentialHashing.opaqueCompletionIdentity(
                identity, "PASSWORD_RESET")).getLong();

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newFixedThreadPool(2)) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select pg_advisory_xact_lock(?)")) {
                lock.setLong(1, lockKey);
                lock.executeQuery();
            }

            var firstCompletion = executor.submit(() -> captureAuthenticationFailure(
                    () -> auth.completePasswordReset(firstFakeFlow, "000000", "Changed123!")));
            var secondCompletion = executor.submit(() -> captureAuthenticationFailure(
                    () -> auth.completePasswordReset(secondFakeFlow, "000000", "Changed123!")));
            assertThatThrownBy(() -> firstCompletion.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            assertThatThrownBy(() -> secondCompletion.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            connection.commit();

            assertThat(firstCompletion.get(10, TimeUnit.SECONDS))
                    .isEqualTo("Authentication code is invalid");
            assertThat(secondCompletion.get(10, TimeUnit.SECONDS))
                    .isEqualTo("Authentication code is invalid");
        }

        assertThat(jdbc.queryForObject("""
                select sum(attempt_count) from auth_challenges
                where purpose = 'OPAQUE_COMPLETION'
                """, Integer.class)).isEqualTo(2);
    }

    @Test
    void workerRetentionPurgesExpiredOpaqueAuthenticationFlowsInBatches() throws Exception {
        jdbc.update("delete from opaque_auth_flows");
        auth.requestPasswordReset("expired-opaque-flow@example.com");
        var realFlow = auth.requestPasswordReset("person@example.com");
        jdbc.update("update opaque_auth_flows set expires_at = now() - interval '1 second'");
        jdbc.update("""
                update auth_challenges set expires_at = now() - interval '1 second'
                where flow_hash = ? and purpose = 'PASSWORD_RESET'
                """, sha256(realFlow.toString()));

        assertThat(auth.purgeExpiredOpaqueAuthenticationFlows()).isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from opaque_auth_flows", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from auth_challenges
                where flow_hash = ? and purpose = 'PASSWORD_RESET'
                """, Integer.class, sha256(realFlow.toString()))).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_outbox
                where event_type = 'PASSWORD_RESET' and delivered_at is not null
                  and last_error_code = 'CHALLENGE_EXPIRED_RETENTION'
                """, Integer.class)).isOne();
        assertThat(auth.purgeExpiredOpaqueAuthenticationFlows()).isFalse();
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
        return auth.requestTwoFactorEnable(userId, "person@example.com");
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

    @Test
    void passwordResetCannotCompleteBeforeTheCodeIsVerified() throws Exception {
        var reset = requestPasswordResetWithCode("654321");

        assertThatThrownBy(() -> auth.completePasswordReset(reset, "Changed123!"))
                .isInstanceOf(AuthenticationException.class);

        assertThat(storedPasswordMatches("Valid123!")).isTrue();
        assertThat(jdbc.queryForObject("""
                select attempt_count from auth_challenges where flow_hash = ?
                """, Integer.class, sha256(reset.toString()))).isOne();

        auth.verifyPasswordReset(reset, "654321");
        auth.completePasswordReset(reset, "Changed123!");

        assertThat(storedPasswordMatches("Changed123!")).isTrue();
    }

    @Test
    void wrongPasswordResetCodeLeavesTheFlowUnverified() throws Exception {
        var reset = requestPasswordResetWithCode("654321");

        assertThatThrownBy(() -> auth.verifyPasswordReset(reset, "000000"))
                .isInstanceOf(AuthenticationException.class);

        assertThat(jdbc.queryForObject("""
                select verified_at is null and consumed_at is null and attempt_count = 1
                from auth_challenges where flow_hash = ?
                """, Boolean.class, sha256(reset.toString()))).isTrue();
        assertThatThrownBy(() -> auth.completePasswordReset(reset, "Changed123!"))
                .isInstanceOf(AuthenticationException.class);
        assertThat(storedPasswordMatches("Valid123!")).isTrue();
    }

    @Test
    void passwordResetVerificationStopsAfterFiveWrongCodes() throws Exception {
        var reset = requestPasswordResetWithCode("654321");
        for (var attempt = 0; attempt < 5; attempt++) {
            assertThatThrownBy(() -> auth.verifyPasswordReset(reset, "000000"))
                    .isInstanceOf(AuthenticationException.class);
        }

        assertThatThrownBy(() -> auth.verifyPasswordReset(reset, "654321"))
                .isInstanceOf(AuthenticationException.class);
        assertThat(jdbc.queryForObject("""
                select verified_at is null from auth_challenges where flow_hash = ?
                """, Boolean.class, sha256(reset.toString()))).isTrue();
    }

    @Test
    void verifiedPasswordResetIsSingleUse() throws Exception {
        var reset = requestPasswordResetWithCode("654321");
        auth.verifyPasswordReset(reset, "654321");
        auth.completePasswordReset(reset, "Changed123!");

        assertThatThrownBy(() -> auth.completePasswordReset(reset, "Another123!"))
                .isInstanceOf(AuthenticationException.class);
        assertThat(storedPasswordMatches("Changed123!")).isTrue();
    }

    @Test
    void newPasswordResetRequestInvalidatesAnEarlierVerifiedFlow() throws Exception {
        var first = requestPasswordResetWithCode("654321");
        auth.verifyPasswordReset(first, "654321");

        auth.requestPasswordReset("person@example.com");

        assertThatThrownBy(() -> auth.completePasswordReset(first, "Changed123!"))
                .isInstanceOf(AuthenticationException.class);
        assertThat(storedPasswordMatches("Valid123!")).isTrue();
    }

    @Test
    void passwordResetVerificationRenewsTheCompletionWindow() throws Exception {
        var reset = requestPasswordResetWithCode("654321");
        jdbc.update("""
                update auth_challenges set expires_at = now() + interval '1 minute' where flow_hash = ?
                """, sha256(reset.toString()));

        auth.verifyPasswordReset(reset, "654321");

        assertThat(jdbc.queryForObject("""
                select expires_at > now() + interval '9 minutes' from auth_challenges where flow_hash = ?
                """, Boolean.class, sha256(reset.toString()))).isTrue();
    }

    @Test
    void repeatedPasswordResetVerificationDoesNotExtendTheCodeAgain() throws Exception {
        var reset = requestPasswordResetWithCode("654321");
        auth.verifyPasswordReset(reset, "654321");
        jdbc.update("""
                update auth_challenges set expires_at = now() + interval '1 minute' where flow_hash = ?
                """, sha256(reset.toString()));

        auth.verifyPasswordReset(reset, "654321");

        assertThat(jdbc.queryForObject("""
                select expires_at < now() + interval '2 minutes' from auth_challenges where flow_hash = ?
                """, Boolean.class, sha256(reset.toString()))).isTrue();
    }

    @Test
    void passwordResetEndpointsRequireVerificationBeforeCompletion() throws Exception {
        var reset = requestPasswordResetWithCode("654321");

        passwordResetRequest("complete", reset, "{\"new_password\":\"Changed123!\"}")
                .andExpect(status().isUnauthorized());
        passwordResetRequest("verify", reset, "{\"code\":\"000000\"}")
                .andExpect(status().isUnauthorized());
        passwordResetRequest("verify", reset, "{\"code\":\"654321\"}")
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(AuthCookieFactory.AUTH_FLOW_COOKIE, 600));
        passwordResetRequest("complete", reset, "{\"new_password\":\"Changed123!\"}")
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(AuthCookieFactory.AUTH_FLOW_COOKIE, 0));

        assertThat(storedPasswordMatches("Changed123!")).isTrue();
    }

    @Test
    void passwordResetCompletionStillAcceptsTheCodeFromEarlierClients() throws Exception {
        var reset = requestPasswordResetWithCode("654321");

        passwordResetRequest("complete", reset, "{\"code\":\"654321\",\"new_password\":\"Changed123!\"}")
                .andExpect(status().isNoContent());

        assertThat(storedPasswordMatches("Changed123!")).isTrue();
    }

    @Test
    void unknownAndRealPasswordResetFlowsFailVerificationIdentically() throws Exception {
        var real = requestPasswordResetWithCode("654321");
        var unknown = auth.requestPasswordReset("unknown@example.com");

        var realVerify = passwordResetRequest("verify", real, "{\"code\":\"000000\"}")
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        var unknownVerify = passwordResetRequest("verify", unknown, "{\"code\":\"000000\"}")
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        var realComplete = passwordResetRequest("complete", real, "{\"new_password\":\"Changed123!\"}")
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        var unknownComplete = passwordResetRequest("complete", unknown, "{\"new_password\":\"Changed123!\"}")
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();

        assertThat(unknownVerify).isEqualTo(realVerify);
        assertThat(unknownComplete).isEqualTo(realComplete);
    }

    @Test
    void passwordResetFailuresCarryMachineReadableCodes() throws Exception {
        var reset = requestPasswordResetWithCode("654321");

        passwordResetRequest("complete", reset, "{\"new_password\":\"short\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PASSWORD_POLICY"));
        passwordResetRequest("verify", reset, "{\"code\":\"654321\"}")
                .andExpect(status().isNoContent());
        passwordResetRequest("complete", reset, "{\"new_password\":\"Valid123!\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PASSWORD_REUSED"));
        passwordResetRequest("complete", reset, "{\"new_password\":\"Changed123!\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_EXPIRED"));

        assertThat(storedPasswordMatches("Valid123!")).isTrue();
    }

    @Test
    void passwordResetRequestReturnsTheSchedule() throws Exception {
        startPasswordResetOverHttp("Person@Example.com")
                .andExpect(status().isAccepted())
                .andExpect(cookie().maxAge(AuthCookieFactory.AUTH_FLOW_COOKIE, 600))
                .andExpect(jsonPath("$.masked_email").value("pe***@example.com"))
                .andExpect(jsonPath("$.expires_at").isString())
                .andExpect(jsonPath("$.resend_available_at").isString());
    }

    @Test
    void passwordResetRequestTellsUnknownAndDeactivatedAccountsApart() throws Exception {
        startPasswordResetOverHttp("nobody@example.com")
                .andExpect(status().isNotFound())
                .andExpect(cookie().doesNotExist(AuthCookieFactory.AUTH_FLOW_COOKIE))
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_ACCOUNT_NOT_FOUND"));
        jdbc.update("update users set state = 'PENDING_EMAIL_VERIFICATION' where id = ?", userId);
        startPasswordResetOverHttp("person@example.com")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_ACCOUNT_NOT_FOUND"));
        jdbc.update("update users set state = 'DEACTIVATED', deactivated_at = now() where id = ?", userId);
        startPasswordResetOverHttp("person@example.com")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_ACCOUNT_DEACTIVATED"));

        assertThat(count("auth_challenges")).isZero();
        assertThat(count("opaque_auth_flows")).isZero();
        assertThat(count("auth_challenge_send_limits")).isZero();
        assertThat(count("notification_outbox")).isZero();
    }

    @Test
    void passwordResetRequestsShareOneCooldownPerEmail() throws Exception {
        startPasswordResetOverHttp("person@example.com").andExpect(status().isAccepted());
        startPasswordResetOverHttp("Person@Example.com")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_RESEND_COOLDOWN"))
                .andExpect(jsonPath("$.retry_at").isString())
                .andExpect(header().exists("Retry-After"));
    }

    @Test
    void passwordResetSendsAreCappedPerHour() throws Exception {
        auth.startPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenge_send_limits
                set send_count = 5, last_sent_at = now() - interval '2 minutes'
                """);

        assertThatThrownBy(() -> auth.startPasswordReset("person@example.com"))
                .isInstanceOfSatisfying(ChallengeSendLimitException.class,
                        limit -> assertThat(limit.code()).isEqualTo("PASSWORD_RESET_RESEND_LIMIT"));
    }

    @Test
    void passwordResetResendKeepsTheFlowAndReplacesTheCode() throws Exception {
        var reset = auth.startPasswordReset("person@example.com").flowId();
        setResetCode(reset, "654321");
        for (var attempt = 0; attempt < 4; attempt++) {
            assertThatThrownBy(() -> auth.verifyPasswordReset(reset, "000000"))
                    .isInstanceOf(AuthenticationException.class);
        }
        allowImmediateResend();

        auth.resendPasswordReset(reset);

        assertThat(jdbc.queryForObject("""
                select attempt_count = 0 and verified_at is null and consumed_at is null
                from auth_challenges where flow_hash = ?
                """, Boolean.class, sha256(reset.toString()))).isTrue();
        assertThatThrownBy(() -> auth.verifyPasswordReset(reset, "654321"))
                .isInstanceOf(AuthenticationException.class);
        setResetCode(reset, "123123");
        auth.verifyPasswordReset(reset, "123123");
        auth.completePasswordReset(reset, "Changed123!");
        assertThat(storedPasswordMatches("Changed123!")).isTrue();
    }

    @Test
    void passwordResetResendQueuesMailWithoutSynchronousSmtp() throws Exception {
        var reset = auth.startPasswordReset("person@example.com").flowId();
        allowImmediateResend();
        clearInvocations(smtp);

        auth.resendPasswordReset(reset);

        verify(smtp, never()).sendChallenge(eq("person@example.com"), org.mockito.ArgumentMatchers.anyString(),
                eq("PASSWORD_RESET"));
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_outbox
                where event_type = 'PASSWORD_RESET' and delivered_at is null
                """, Integer.class)).isOne();
    }

    @Test
    void passwordResetFailuresDistinguishMismatchExhaustionAndExpiry() throws Exception {
        var reset = requestPasswordResetWithCode("654321");

        passwordResetRequest("complete", reset, "{\"new_password\":\"Changed123!\"}")
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_NOT_VERIFIED"));
        for (var attempt = 0; attempt < 3; attempt++) {
            passwordResetRequest("verify", reset, "{\"code\":\"000000\"}")
                    .andExpect(jsonPath("$.code").value("PASSWORD_RESET_CODE_MISMATCH"));
        }
        passwordResetRequest("verify", reset, "{\"code\":\"000000\"}")
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_ATTEMPTS_EXCEEDED"));
        passwordResetRequest("verify", reset, "{\"code\":\"654321\"}")
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_ATTEMPTS_EXCEEDED"));

        jdbc.update("update auth_challenges set expires_at = now() - interval '1 second' where flow_hash = ?",
                sha256(reset.toString()));
        passwordResetRequest("verify", reset, "{\"code\":\"654321\"}")
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_EXPIRED"));
        passwordResetRequest("verify", UUID.randomUUID(), "{\"code\":\"654321\"}")
                .andExpect(jsonPath("$.code").value("PASSWORD_RESET_EXPIRED"));
    }

    @Test
    void unknownAndRealPasswordResetFlowsAnswerEveryStepIdentically() throws Exception {
        var real = auth.startPasswordReset("person@example.com").flowId();
        // Opaque flows are no longer issued by the request API but stay indistinguishable if presented.
        var unknown = auth.requestPasswordReset("nobody@example.com");
        var steps = new String[][] {
                {"complete", "{\"new_password\":\"Changed123!\"}"},
                {"verify", "{\"code\":\"000000\"}"},
                {"verify", "{\"code\":\"000000\"}"},
                {"verify", "{\"code\":\"000000\"}"},
                {"verify", "{\"code\":\"000000\"}"},
                {"verify", "{\"code\":\"000000\"}"},
        };
        for (var step : steps) {
            assertThat(responseOf(step[0], unknown, step[1])).isEqualTo(responseOf(step[0], real, step[1]));
        }

        allowImmediateResend();
        assertThat(passwordResetRequest("resend", unknown, "{}").andReturn().getResponse().getStatus())
                .isEqualTo(passwordResetRequest("resend", real, "{}").andReturn().getResponse().getStatus());
        assertThat(responseOf("verify", unknown, "{\"code\":\"000000\"}"))
                .isEqualTo(responseOf("verify", real, "{\"code\":\"000000\"}"));

        allowImmediateResend();
        auth.startPasswordReset("person@example.com");
        auth.requestPasswordReset("nobody@example.com");
        assertThat(responseOf("verify", unknown, "{\"code\":\"000000\"}"))
                .isEqualTo(responseOf("verify", real, "{\"code\":\"000000\"}"))
                .contains("PASSWORD_RESET_EXPIRED");
    }

    private ResultActions startPasswordResetOverHttp(String email) throws Exception {
        return mvc.perform(post("/api/v1/auth/password-reset/request")
                .header("Origin", "https://localhost")
                .header("Sec-Fetch-Site", "same-origin")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\"}"));
    }

    private String responseOf(String step, UUID flow, String body) throws Exception {
        var response = passwordResetRequest(step, flow, body).andReturn().getResponse();
        return response.getStatus() + " " + response.getContentAsString();
    }

    private void setResetCode(UUID flow, String code) throws Exception {
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where flow_hash = ? and purpose = 'PASSWORD_RESET'
                """, codeProtector.verifier(code), sha256(flow.toString()));
    }

    private void allowImmediateResend() {
        jdbc.update("update auth_challenge_send_limits set last_sent_at = now() - interval '2 minutes'");
    }

    private UUID requestPasswordResetWithCode(String code) throws Exception {
        var reset = auth.requestPasswordReset("person@example.com");
        jdbc.update("""
                update auth_challenges set code_hash = ?
                where flow_hash = ? and purpose = 'PASSWORD_RESET'
                """, codeProtector.verifier(code), sha256(reset.toString()));
        return reset;
    }

    private ResultActions passwordResetRequest(String step, UUID flow, String body) throws Exception {
        return mvc.perform(post("/api/v1/auth/password-reset/" + step)
                .cookie(new Cookie(AuthCookieFactory.AUTH_FLOW_COOKIE, flow.toString()))
                .header("Origin", "https://localhost")
                .header("Sec-Fetch-Site", "same-origin")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private boolean storedPasswordMatches(String password) {
        var encoded = jdbc.queryForObject(
                "select password_hash from credentials where user_id = ?", String.class, userId);
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8().matches(password, encoded);
    }

    private boolean attemptPasswordChange(
            CountDownLatch ready, CountDownLatch start, String newPassword)
            throws InterruptedException {
        ready.countDown();
        if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("password race did not start");
        try {
            auth.changePassword(userId, "Valid123!", newPassword);
            return true;
        } catch (AuthenticationException expected) {
            return false;
        }
    }

    private byte[] sha256(String value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
    }
}
