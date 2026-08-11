package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SessionPolicyTest {
    private final SessionCookieFactory cookies = new SessionCookieFactory();

    @Test
    void participantCookieIsOpaqueHostOnlyHttpOnlySecureAndSevenDays() {
        var value = cookies.authenticated("opaque-value", SessionService.SessionRole.PARTICIPANT).toString();
        assertThat(value).contains("__Host-civic-session=opaque-value", "Path=/", "Secure", "HttpOnly",
                "SameSite=Lax", "Max-Age=604800");
        assertThat(value).doesNotContain("Domain=", "Bearer", "access_token", "refresh_token");
    }

    @Test
    void administratorCookieIsTwelveHoursAndAuthFlowIsStrictForTenMinutes() {
        assertThat(cookies.authenticated("admin", SessionService.SessionRole.ADMIN).toString())
                .contains("Max-Age=43200", "SameSite=Lax");
        assertThat(cookies.authFlow("flow").toString())
                .contains("__Host-civic-auth-flow=flow", "Max-Age=600", "SameSite=Strict", "HttpOnly");
    }

    @Test
    void deletionUsesTheSameHostOnlyCookieBoundary() {
        var deleted = cookies.deleteAuthenticated().toString();
        assertThat(deleted).contains("__Host-civic-session=", "Max-Age=0", "Path=/", "Secure", "HttpOnly");
        assertThat(deleted).doesNotContain("Domain=");
    }
}
