package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.support.PostgresIntegrationTest;
import com.nimbusds.jwt.SignedJWT;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class RefreshTokenAuthenticationLifecycleTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired CredentialIssuanceService credentialIssuance;
    @Autowired RefreshTokenService refreshTokens;
    private final Argon2PasswordEncoder passwords =
            Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    private UUID userId;

    @BeforeEach
    void createUser() {
        jdbc.update("delete from refresh_tokens");
        var email = "refresh-user-" + UUID.randomUUID() + "@example.test";
        userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        jdbc.update("insert into credentials(user_id, password_hash) values (?, ?)",
                userId, passwords.encode("Valid123!"));
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, userId);
    }

    @Test
    void loginIssuesAccessAndRefreshCookiesWithoutServerSession() throws Exception {
        var login = login();
        var access = responseCookie(login, AuthCookieFactory.ACCESS_TOKEN_COOKIE);
        var refresh = responseCookie(login, AuthCookieFactory.REFRESH_TOKEN_COOKIE);

        assertThat(access.getValue()).contains(".");
        var accessClaims = SignedJWT.parse(access.getValue()).getJWTClaimsSet();
        assertThat(accessClaims.getSubject()).isEqualTo(userId.toString());
        assertThat(accessClaims.getStringClaim("email")).isEqualTo(jdbc.queryForObject(
                "select normalized_email from users where id = ?", String.class, userId));
        assertThat(refresh.getValue()).doesNotContain(".");
        assertThat(login.getResponse().getCookie("__Host-civic-session")).isNull();
        assertThat(refresh.getPath()).isEqualTo(AuthCookieFactory.REFRESH_TOKEN_PATH);
        assertThat(refresh.isHttpOnly()).isTrue();
        assertThat(refresh.getSecure()).isTrue();

        var storedHash = jdbc.queryForObject(
                "select token_hash from refresh_tokens where user_id = ?", byte[].class, userId);
        assertThat(storedHash).containsExactly(RefreshTokenService.sha256(refresh.getValue()));

        mvc.perform(get("/api/v1/auth/me").cookie(access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user_id").value(userId.toString()))
                .andExpect(jsonPath("$.role").value("PARTICIPANT"));
    }

    @Test
    void refreshRotatesBothCredentialsAndDetectsReuse() throws Exception {
        var login = login();
        var oldRefresh = responseCookie(login, AuthCookieFactory.REFRESH_TOKEN_COOKIE);

        var refreshed = mvc.perform(post("/api/v1/auth/refresh")
                        .cookie(oldRefresh)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNoContent())
                .andExpect(cookie().exists(AuthCookieFactory.ACCESS_TOKEN_COOKIE))
                .andExpect(cookie().exists(AuthCookieFactory.REFRESH_TOKEN_COOKIE))
                .andReturn();
        var nextRefresh = responseCookie(refreshed, AuthCookieFactory.REFRESH_TOKEN_COOKIE);
        assertThat(nextRefresh.getValue()).isNotEqualTo(oldRefresh.getValue());
        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where rotated_at is not null", Integer.class)).isOne();

        mvc.perform(post("/api/v1/auth/refresh")
                        .cookie(oldRefresh)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());

        jdbc.update("""
                update refresh_tokens
                set rotated_at = timestamptz '2000-01-01 00:00:00+00'
                where rotated_at is not null
                """);
        mvc.perform(post("/api/v1/auth/refresh")
                        .cookie(oldRefresh)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where revoked_at is null", Integer.class)).isZero();
    }

    @Test
    void logoutRevokesOnlyThePresentedFamilyAndClearsBothCookies() throws Exception {
        var first = responseCookie(login(), AuthCookieFactory.REFRESH_TOKEN_COOKIE);
        var second = responseCookie(login(), AuthCookieFactory.REFRESH_TOKEN_COOKIE);

        mvc.perform(post("/api/v1/auth/logout")
                        .cookie(first)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(AuthCookieFactory.ACCESS_TOKEN_COOKIE, 0))
                .andExpect(cookie().maxAge(AuthCookieFactory.REFRESH_TOKEN_COOKIE, 0));

        assertThat(jdbc.queryForObject(
                "select count(distinct family_id) from refresh_tokens where revoked_at is null",
                Integer.class)).isOne();
        mvc.perform(post("/api/v1/auth/refresh")
                        .cookie(second)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNoContent());
    }

    @Test
    void loggingInAgainFromTheSameBrowserRevokesTheReplacedFamily() throws Exception {
        var first = responseCookie(login(), AuthCookieFactory.REFRESH_TOKEN_COOKIE);

        var email = jdbc.queryForObject("select email from users where id = ?", String.class, userId);
        mvc.perform(post("/api/v1/auth/login")
                        .cookie(first)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"Valid123!\"}"))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ? and revoked_at is null",
                Integer.class, userId)).isOne();
        assertThat(jdbc.queryForObject("""
                select count(*) from refresh_tokens
                where user_id = ? and revocation_reason = 'REAUTHENTICATED'
                """, Integer.class, userId)).isOne();
    }

    @Test
    void loginCredentialIssuanceRevalidatesAccountStateUnderTheUserLock() throws Exception {
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }

            var issuance = executor.submit(() -> credentialIssuance.issueForLogin(userId));
            assertThatThrownBy(() -> issuance.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var deactivate = connection.prepareStatement("""
                    update users set state = 'DEACTIVATED',
                        account_state_version = account_state_version + 1 where id = ?
                    """)) {
                deactivate.setObject(1, userId);
                deactivate.executeUpdate();
            }
            connection.commit();

            assertThatThrownBy(() -> issuance.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }
        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ?", Integer.class, userId)).isZero();
    }

    @Test
    void refreshRevalidatesAccountStateAndRevokesTheFamilyWhenItChangesDuringRotation()
            throws Exception {
        var refresh = credentialIssuance.issueForLogin(userId).refreshToken();
        try (var connection = jdbc.getDataSource().getConnection();
                var executor = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("select id from users where id = ? for update")) {
                lock.setObject(1, userId);
                lock.executeQuery();
            }

            var issuance = executor.submit(() -> credentialIssuance.refresh(refresh));
            assertThatThrownBy(() -> issuance.get(250, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            try (var deactivate = connection.prepareStatement("""
                    update users set state = 'DEACTIVATED',
                        account_state_version = account_state_version + 1 where id = ?
                    """)) {
                deactivate.setObject(1, userId);
                deactivate.executeUpdate();
            }
            connection.commit();

            assertThatThrownBy(() -> issuance.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(AuthenticationException.class);
        }
        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ? and revoked_at is null",
                Integer.class, userId)).isZero();
    }

    @Test
    void workerRetentionDeletesAnExpiredFamilyAsOneChain() throws Exception {
        var first = credentialIssuance.issueForLogin(userId).refreshToken();
        credentialIssuance.refresh(first);
        jdbc.update("""
                update refresh_tokens
                set expires_at = now() - interval '1 second',
                    family_expires_at = now() - interval '1 second'
                where user_id = ?
                """, userId);

        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ?", Integer.class, userId))
                .isEqualTo(2);
        assertThat(refreshTokens.purgeExpiredFamilies()).isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ?", Integer.class, userId)).isZero();
    }

    private MvcResult login() throws Exception {
        var email = jdbc.queryForObject("select email from users where id = ?", String.class, userId);
        return mvc.perform(post("/api/v1/auth/login")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"Valid123!\"}"))
                .andExpect(status().isNoContent())
                .andReturn();
    }

    private Cookie responseCookie(MvcResult result, String name) {
        var cookie = result.getResponse().getCookie(name);
        assertThat(cookie).isNotNull();
        return cookie;
    }
}
