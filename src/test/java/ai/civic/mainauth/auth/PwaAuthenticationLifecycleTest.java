package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ai.civic.mainauth.notification.SmtpNotificationService;
import ai.civic.mainauth.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
        "spring.main.lazy-initialization=true",
        "civic.auth.hmac-secret=test-auth-hmac-secret-with-at-least-32-bytes"
})
@AutoConfigureMockMvc
class PwaAuthenticationLifecycleTest extends PostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PwaRefreshTokenService pwaRefreshTokens;
    @Autowired AccessCredentialTestFactory credentials;
    @MockitoBean SmtpNotificationService smtp;

    private UUID userId;
    private String email;

    @BeforeEach
    void createUser() {
        jdbc.update("delete from pwa_refresh_sessions");
        email = "pwa-user-" + UUID.randomUUID() + "@example.test";
        userId = jdbc.queryForObject("""
                insert into users(email, normalized_email, origin, state, email_verified_at)
                values (?, ?, 'SIGNUP', 'ACTIVE', now()) returning id
                """, UUID.class, email, email);
        var password = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8().encode("Valid123!");
        jdbc.update("""
                insert into credentials(user_id, password_hash, two_factor_enabled)
                values (?, ?, true)
                """, userId, password);
        jdbc.update("""
                insert into user_roles(user_id, role_id)
                select ?, id from roles where code = 'PARTICIPANT'
                """, userId);
    }

    @Test
    void pwaLoginSkipsSecondFactorAndCreatesOnlyThePwaRefreshSession() throws Exception {
        var result = login();
        var access = responseCookie(result, AuthCookieFactory.ACCESS_TOKEN_COOKIE);
        var refresh = responseCookie(result, AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE);

        assertThat(access.getValue()).contains(".");
        assertThat(refresh.getValue()).doesNotContain(".");
        assertThat(refresh.getPath()).isEqualTo(AuthCookieFactory.PWA_REFRESH_TOKEN_PATH);
        assertThat(refresh.isHttpOnly()).isTrue();
        assertThat(refresh.getSecure()).isTrue();
        assertThat(result.getResponse().getCookie(AuthCookieFactory.REFRESH_TOKEN_COOKIE)).isNull();
        assertThat(jdbc.queryForObject(
                "select count(*) from auth_challenges where user_id = ?", Integer.class, userId)).isZero();
        assertThat(jdbc.queryForObject(
                "select count(*) from pwa_refresh_sessions where user_id = ?", Integer.class, userId)).isOne();
        assertThat(jdbc.queryForObject(
                "select count(*) from refresh_tokens where user_id = ?", Integer.class, userId)).isZero();
        assertThat(jdbc.queryForObject("""
                select token.token_hash from pwa_refresh_tokens token
                join pwa_refresh_sessions session on session.id = token.session_id
                where session.user_id = ?
                """, byte[].class, userId))
                .containsExactly(PwaRefreshTokenService.sha256(refresh.getValue()));
    }

    @Test
    void pwaRefreshRotatesTheTokenAndSlidesTheIdleExpiryByNinetyDays() throws Exception {
        var oldRefresh = responseCookie(login(), AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE);
        jdbc.update("""
                update pwa_refresh_sessions set expires_at = now() + interval '1 day'
                where user_id = ?
                """, userId);

        var refreshed = refresh(oldRefresh, 204);
        var nextRefresh = responseCookie(refreshed, AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE);

        assertThat(nextRefresh.getValue()).isNotEqualTo(oldRefresh.getValue());
        assertThat(jdbc.queryForObject(
                "select expires_at from pwa_refresh_sessions where user_id = ?",
                java.sql.Timestamp.class, userId).toInstant())
                .isAfter(Instant.now().plusSeconds(89L * 24 * 60 * 60));
        assertThat(jdbc.queryForObject(
                "select count(*) from pwa_refresh_tokens where rotated_at is not null",
                Integer.class)).isOne();

        refresh(oldRefresh, 409);
        jdbc.update("""
                update pwa_refresh_tokens
                set rotated_at = timestamptz '2000-01-01 00:00:00+00'
                where rotated_at is not null
                """);
        refresh(oldRefresh, 401);
        assertThat(jdbc.queryForObject("""
                select count(*) from pwa_refresh_sessions
                where user_id = ? and revocation_reason = 'REUSE_DETECTED'
                """, Integer.class, userId)).isOne();
    }

    @Test
    void pwaLogoutRevokesItsSessionAndDeletesTheMatchingCookies() throws Exception {
        var refresh = responseCookie(login(), AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE);

        mvc.perform(post("/api/v1/auth/pwa/logout")
                        .cookie(refresh)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(AuthCookieFactory.ACCESS_TOKEN_COOKIE, 0))
                .andExpect(cookie().maxAge(AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE, 0));

        assertThat(jdbc.queryForObject("""
                select count(*) from pwa_refresh_sessions
                where user_id = ? and revocation_reason = 'LOGOUT'
                """, Integer.class, userId)).isOne();
        refresh(refresh, 401);
    }

    @Test
    void logoutAllRevokesThePwaSessionAndDeletesItsCookie() throws Exception {
        login();
        var credential = credentials.issue(userId);

        mvc.perform(post("/api/v1/auth/logout-all")
                        .cookie(new Cookie(
                                AuthCookieFactory.ACCESS_TOKEN_COOKIE, credential.accessToken()))
                        .header("X-CSRF-Token", credential.csrfToken())
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge(AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE, 0));

        assertThat(jdbc.queryForObject("""
                select count(*) from pwa_refresh_sessions
                where user_id = ? and revocation_reason = 'LOGOUT_ALL'
                """, Integer.class, userId)).isOne();
    }

    @Test
    void workerRetentionDeletesAnExpiredPwaSessionAndItsTokenChain() throws Exception {
        login();
        jdbc.update("""
                update pwa_refresh_sessions
                set created_at = now() - interval '100 days',
                    last_used_at = now() - interval '100 days',
                    expires_at = now() - interval '1 second'
                where user_id = ?
                """, userId);

        assertThat(pwaRefreshTokens.purgeExpiredSessions()).isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from pwa_refresh_sessions where user_id = ?", Integer.class, userId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from pwa_refresh_tokens", Integer.class)).isZero();
    }

    private MvcResult login() throws Exception {
        return mvc.perform(post("/api/v1/auth/pwa/login")
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"Valid123!\"}"))
                .andExpect(status().isNoContent())
                .andReturn();
    }

    private MvcResult refresh(Cookie refresh, int expectedStatus) throws Exception {
        return mvc.perform(post("/api/v1/auth/pwa/refresh")
                        .cookie(refresh)
                        .header("Origin", "https://localhost")
                        .header("Sec-Fetch-Site", "same-origin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().is(expectedStatus))
                .andReturn();
    }

    private Cookie responseCookie(MvcResult result, String name) {
        var cookie = result.getResponse().getCookie(name);
        assertThat(cookie).isNotNull();
        return cookie;
    }
}
