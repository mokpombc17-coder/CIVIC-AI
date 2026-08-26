package ai.civic.mainauth.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.auth.AccessCredentialTestFactory;
import ai.civic.mainauth.auth.AuthCookieFactory;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class AdminUserControllerTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccessCredentialTestFactory credentials;

    @Test
    void regularAdministratorCannotReadHighestAdministratorUserDirectory() throws Exception {
        var email = "regular-admin-" + UUID.randomUUID() + "@example.test";
        var administratorId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'ADMIN_CREATED', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", administratorId);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'ADMIN'
                """, administratorId);
        var credential = credentials.issue(administratorId);

        mvc.perform(get("/api/v1/admin/users")
                        .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken())))
                .andExpect(status().isForbidden());
    }

    @Test
    void unknownUserReturnsNotFoundInsteadOfServerError() throws Exception {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", administratorId);
        var credential = credentials.issue(administratorId);

        mvc.perform(get("/api/v1/admin/users/{userId}", UUID.randomUUID())
                        .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken())))
                .andExpect(status().isNotFound());
    }

    @Test
    void roleUpdateForUnknownUserReturnsNotFoundInsteadOfServerError() throws Exception {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", administratorId);
        var credential = credentials.issue(administratorId);

        mvc.perform(put("/api/v1/admin/users/{userId}/roles", UUID.randomUUID())
                        .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                        .header("X-CSRF-Token", credential.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roles":["PARTICIPANT"],"permissions":[],"rowVersion":0,
                                 "reason":"존재하지 않는 대상 확인","impactConfirmed":false}
                                """))
                .andExpect(status().isNotFound());
    }

    @Test
    void refreshRevocationDoesNotInvalidateAnAlreadyIssuedAccessToken() throws Exception {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", administratorId);
        var credential = credentials.issue(administratorId);
        var targetEmail = "role-race-" + UUID.randomUUID() + "@example.test";
        var targetId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'ADMIN_CREATED', 'ACTIVE', now()) returning id
                """, UUID.class, targetEmail, targetEmail);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", targetId);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, targetId);

        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, administratorId);
                lock.executeQuery();
            }
            var response = executor.submit(() -> mvc.perform(
                            put("/api/v1/admin/users/{userId}/roles", targetId)
                                    .cookie(new Cookie(
                                            AuthCookieFactory.ACCESS_TOKEN_COOKIE,
                                            credential.accessToken()))
                                    .header("X-CSRF-Token", credential.csrfToken())
                                    .header("Origin", "https://localhost")
                                    .header("Sec-Fetch-Site", "same-origin")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                            {"roles":["ADMIN"],"permissions":[],"rowVersion":0,
                                             "reason":"리프레시 토큰 폐기 경쟁 조건 확인",
                                             "impactConfirmed":false}
                                            """))
                    .andReturn().getResponse().getStatus());

            assertThatThrownBy(() -> response.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var rotate = connection.prepareStatement("""
                        update credentials set password_changed_at = now() where user_id = ?
                    """);
                    var revoke = connection.prepareStatement("""
                        update refresh_tokens set revoked_at = now(), revocation_reason = 'PASSWORD_CHANGED'
                        where user_id = ? and revoked_at is null
                    """)) {
                rotate.setObject(1, administratorId);
                rotate.executeUpdate();
                revoke.setObject(1, administratorId);
                revoke.executeUpdate();
            }
            connection.commit();

            assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        }

        assertThat(jdbc.queryForObject("select row_version from users where id = ?", Long.class, targetId))
                .isOne();
        assertThat(jdbc.queryForObject("""
                select count(*) from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = ? and ur.revoked_at is null and r.code = 'ADMIN'
                """, Integer.class, targetId)).isOne();
    }
}
