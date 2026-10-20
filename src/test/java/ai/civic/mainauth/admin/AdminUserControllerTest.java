package ai.civic.mainauth.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.auth.AccessCredentialTestFactory;
import ai.civic.mainauth.auth.AuthCookieFactory;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    @Autowired ObjectMapper json;

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

    @Test
    void userDirectoryPagesBeyondOneHundredUsersWithStableCursor() throws Exception {
        var credential = bootstrapAdministratorCredential();
        var marker = "page-" + UUID.randomUUID().toString().substring(0, 8);
        var inserted = new java.util.HashSet<String>();
        for (var index = 0; index < 105; index++) {
            var email = marker + "-" + index + "@example.test";
            // Several users share a created_at so the id tie-breaker is exercised.
            var userId = jdbc.queryForObject("""
                    insert into users(email, normalized_email, origin, state, created_at)
                    values (?, ?, 'SIGNUP', 'ACTIVE', timestamptz '2026-01-01 00:00:00+00' + (? / 3) * interval '1 minute')
                    returning id
                    """, UUID.class, email, email, index);
            jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", userId);
            inserted.add(userId.toString());
        }

        var seen = new java.util.ArrayList<String>();
        String cursor = null;
        var pages = 0;
        do {
            var request = get("/api/v1/admin/users")
                    .param("query", marker)
                    .param("limit", "40")
                    .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()));
            if (cursor != null) request.param("cursor", cursor);
            var body = json.readTree(mvc.perform(request)
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString());
            assertThat(body.get("total").asLong()).isEqualTo(105);
            body.get("items").forEach(item -> seen.add(item.get("user_id").asText()));
            cursor = body.get("next_cursor").isNull() ? null : body.get("next_cursor").asText();
            pages++;
        } while (cursor != null && pages < 10);

        assertThat(pages).isEqualTo(3);
        assertThat(seen).hasSize(105).doesNotHaveDuplicates();
        assertThat(new java.util.HashSet<>(seen)).isEqualTo(inserted);
    }

    @Test
    void userDirectoryFiltersByStatusOnTheServer() throws Exception {
        var credential = bootstrapAdministratorCredential();
        var marker = "status-" + UUID.randomUUID().toString().substring(0, 8);
        var active = insertUser(marker + "-active@example.test", "ACTIVE");
        var inactive = insertUser(marker + "-inactive@example.test", "DEACTIVATED");
        var admin = insertUser(marker + "-admin@example.test", "ACTIVE");
        jdbc.update("insert into user_roles(user_id, role_id) select ?, id from roles where code = 'ADMIN'",
                UUID.fromString(admin));
        var revoked = insertUser(marker + "-revoked@example.test", "ACTIVE");
        jdbc.update("""
                insert into user_roles(user_id, role_id, revoked_at)
                select ?, id, now() from roles where code = 'SUPER_ADMIN'
                """, UUID.fromString(revoked));

        assertThat(directoryIds(credential, marker, "all")).containsExactlyInAnyOrder(active, inactive, admin, revoked);
        assertThat(directoryIds(credential, marker, "active")).containsExactlyInAnyOrder(active, admin, revoked);
        assertThat(directoryIds(credential, marker, "inactive")).containsExactly(inactive);
        assertThat(directoryIds(credential, marker, "admin")).containsExactly(admin);
    }

    @Test
    void userDirectoryRejectsInvalidPagingParameters() throws Exception {
        var credential = bootstrapAdministratorCredential();
        var cookie = new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken());

        mvc.perform(get("/api/v1/admin/users").param("limit", "0").cookie(cookie)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/admin/users").param("limit", "201").cookie(cookie)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/admin/users").param("status", "deleted").cookie(cookie))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/admin/users").param("cursor", "not-a-cursor").cookie(cookie))
                .andExpect(status().isBadRequest());
    }

    private AccessCredentialTestFactory.IssuedCredential bootstrapAdministratorCredential() {
        var administratorId = jdbc.queryForObject(
                "select id from users where origin = 'BOOTSTRAP_ADMIN'", UUID.class);
        jdbc.update("update credentials set must_change_password = false where user_id = ?", administratorId);
        return credentials.issue(administratorId);
    }

    private String insertUser(String email, String state) {
        var userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state) values (?, ?, 'SIGNUP', ?) returning id
                """, UUID.class, email, email, state);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, 'test-hash')", userId);
        return userId.toString();
    }

    private java.util.List<String> directoryIds(
            AccessCredentialTestFactory.IssuedCredential credential, String query, String status) throws Exception {
        var body = json.readTree(mvc.perform(get("/api/v1/admin/users")
                        .param("query", query)
                        .param("status", status)
                        .cookie(new Cookie(AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        var ids = new java.util.ArrayList<String>();
        body.get("items").forEach(item -> ids.add(item.get("user_id").asText()));
        assertThat(body.get("total").asLong()).isEqualTo(ids.size());
        return ids;
    }
}
