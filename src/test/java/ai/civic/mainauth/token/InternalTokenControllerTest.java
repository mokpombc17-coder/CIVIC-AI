package ai.civic.mainauth.token;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.auth.SessionCookieFactory;
import ai.civic.mainauth.auth.SessionService;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class InternalTokenControllerTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired SessionService sessions;

    @Test
    void passwordRotationRequiredSessionCannotMintRagToken() throws Exception {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        var session = sessions.issue(administratorId, SessionService.SessionRole.HIGHEST_ADMIN);

        mvc.perform(post("/internal/v1/tokens")
                        .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                        .header("X-CSRF-Token", session.csrfToken())
                        .header(InternalTokenController.INTERNAL_SECRET_HEADER,
                                "local-development-internal-client-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"audience":"civic-rag","scopes":["rag:documents:write"]}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void tokenIssuanceWaitsForSecurityChangesAndRevalidatesBeforeSigning() throws Exception {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", administratorId);
        var session = sessions.issue(administratorId, SessionService.SessionRole.HIGHEST_ADMIN);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, administratorId);
                lock.executeQuery();
            }

            var response = executor.submit(() -> mvc.perform(post("/internal/v1/tokens")
                            .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                            .header("X-CSRF-Token", session.csrfToken())
                            .header(InternalTokenController.INTERNAL_SECRET_HEADER,
                                    "local-development-internal-client-secret")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"audience":"civic-rag","scopes":["rag:documents:write"]}
                                    """))
                    .andReturn().getResponse().getStatus());

            org.assertj.core.api.Assertions.assertThatThrownBy(
                            () -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var update = connection.prepareStatement(
                    "update credentials set must_change_password = true where user_id = ?")) {
                update.setObject(1, administratorId);
                update.executeUpdate();
            }
            connection.commit();

            org.assertj.core.api.Assertions.assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(403);
        }
    }

    @Test
    void tokenIssuanceWaitsForLogoutAndRejectsTheRevokedSession() throws Exception {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", administratorId);
        var session = sessions.issue(administratorId, SessionService.SessionRole.HIGHEST_ADMIN);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("""
                    select session_hash from sessions
                    where user_id = ? and revoked_at is null for update
                    """)) {
                lock.setObject(1, administratorId);
                lock.executeQuery();
            }

            var response = executor.submit(() -> mvc.perform(post("/internal/v1/tokens")
                            .cookie(new Cookie(SessionCookieFactory.SESSION_COOKIE, session.sessionId()))
                            .header("X-CSRF-Token", session.csrfToken())
                            .header(InternalTokenController.INTERNAL_SECRET_HEADER,
                                    "local-development-internal-client-secret")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"audience":"civic-rag","scopes":["rag:documents:write"]}
                                    """))
                    .andReturn().getResponse().getStatus());

            org.assertj.core.api.Assertions.assertThatThrownBy(
                            () -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var revoke = connection.prepareStatement("""
                    update sessions set revoked_at = now(), revocation_reason = 'LOGOUT'
                    where user_id = ? and revoked_at is null
                    """)) {
                revoke.setObject(1, administratorId);
                revoke.executeUpdate();
            }
            connection.commit();

            org.assertj.core.api.Assertions.assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(401);
        }
    }
}
