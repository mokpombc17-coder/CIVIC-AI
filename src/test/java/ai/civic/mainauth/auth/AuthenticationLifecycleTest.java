package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@SpringBootTest(properties = {
        "spring.main.lazy-initialization=true",
        "civic.session.hmac-secret=test-session-hmac-secret-with-at-least-32-bytes"
})
@AutoConfigureMockMvc
class AuthenticationLifecycleTest extends PostgresIntegrationTest {
    @Autowired AuthenticationFlowService auth;
    @Autowired SessionService sessions;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @MockitoBean SmtpNotificationService smtp;

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
    void unknownEmailAndWrongPasswordHaveTheSamePublicFailure() {
        var unknown = captureFailure("unknown@example.com", "Wrong123!");
        var wrong = captureFailure("person@example.com", "Wrong123!");
        assertThat(unknown).isEqualTo(wrong).isEqualTo("Email or password is invalid");
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

        auth.changePassword(userId, "Valid123!", "Changed123!");

        assertThatThrownBy(() -> sessions.require(first)).isInstanceOf(AuthenticationException.class);
        assertThatThrownBy(() -> sessions.require(second)).isInstanceOf(AuthenticationException.class);
        assertThat(jdbc.queryForObject(
                "select count(*) from sessions where user_id = ? and revoked_at is null", Integer.class, userId))
                .isZero();
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
        verify(smtp).sendChallenge(eq("person@example.com"), challengeCode(), eq("REACTIVATION"));
    }

    @Test
    void passwordResetQueuesDeliveryWhileTwoFactorStillDeliversSynchronously() {
        auth.requestPasswordReset("person@example.com");
        auth.requestTwoFactorEnable(userId, "person@example.com");

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

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
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

    private byte[] sha256(String value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
    }
}
