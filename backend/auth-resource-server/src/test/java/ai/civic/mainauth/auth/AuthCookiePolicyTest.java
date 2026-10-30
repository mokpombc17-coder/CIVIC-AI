package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class AuthCookiePolicyTest {
    private final AuthCookieFactory cookies = new AuthCookieFactory(true);

    @Test
    void accessAndRefreshCookiesHaveSeparatePathsAndSafeAttributes() {
        var access = cookies.accessToken("access", Instant.parse("2026-08-26T03:15:00Z"));
        var refresh = cookies.refreshToken("refresh", Instant.parse("2026-09-02T03:00:00Z"));
        var pwaRefresh = cookies.pwaRefreshToken(
                "pwa-refresh", Instant.parse("2026-11-24T03:00:00Z"));

        assertThat(access)
                .startsWith("civic_ai_access_token=access;")
                .contains(
                        "Path=/", "Secure", "HttpOnly", "SameSite=Lax",
                        "Expires=Wed, 26 Aug 2026 03:15:00 GMT")
                .doesNotContain("Max-Age=")
                .doesNotContain("Domain=");
        assertThat(refresh)
                .startsWith("civic_ai_refresh_token=refresh;")
                .contains(
                        "Path=/api/v1/auth", "Secure", "HttpOnly", "SameSite=Lax",
                        "Expires=Wed, 2 Sep 2026 03:00:00 GMT")
                .doesNotContain("Max-Age=")
                .doesNotContain("Domain=");
        assertThat(pwaRefresh)
                .startsWith("civic_ai_pwa_refresh_token=pwa-refresh;")
                .contains(
                        "Path=/api/v1/auth/pwa", "Secure", "HttpOnly", "SameSite=Lax",
                        "Expires=Tue, 24 Nov 2026 03:00:00 GMT")
                .doesNotContain("Max-Age=")
                .doesNotContain("Domain=");
    }

    @Test
    void deletionUsesTheSameCookiePaths() {
        assertThat(cookies.deleteAccessToken().toString()).contains("Path=/", "Max-Age=0");
        assertThat(cookies.deleteRefreshToken().toString())
                .contains("Path=/api/v1/auth", "Max-Age=0");
        assertThat(cookies.deletePwaRefreshToken().toString())
                .contains("Path=/api/v1/auth/pwa", "Max-Age=0");
    }
}
