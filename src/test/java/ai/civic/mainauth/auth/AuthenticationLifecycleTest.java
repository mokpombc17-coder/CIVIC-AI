package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

@SpringBootTest(properties = {
        "spring.main.lazy-initialization=true",
        "civic.session.hmac-secret=test-session-hmac-secret-with-at-least-32-bytes"
})
class AuthenticationLifecycleTest extends PostgresIntegrationTest {
    @Autowired AuthenticationFlowService auth;
    @Autowired SessionService sessions;
    @Autowired JdbcTemplate jdbc;

    private UUID userId;

    @BeforeEach
    void createActiveParticipant() {
        jdbc.update("delete from sessions");
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
}
