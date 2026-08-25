package ai.civic.mainauth.auth;

import java.time.Duration;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public final class SessionCookieFactory {
    public static final String SESSION_COOKIE = "__Host-civic-session";
    public static final String AUTH_FLOW_COOKIE = "__Host-civic-auth-flow";
    public static final String ACCESS_TOKEN_COOKIE = "civic_ai_access_token";

    public ResponseCookie authenticated(String opaqueId, SessionService.SessionRole role) {
        var maxAge = role == SessionService.SessionRole.PARTICIPANT
                ? Duration.ofDays(7) : Duration.ofHours(12);
        return base(SESSION_COOKIE, opaqueId, "Lax").maxAge(maxAge).build();
    }

    public ResponseCookie authFlow(String opaqueId) {
        return base(AUTH_FLOW_COOKIE, opaqueId, "Strict").maxAge(Duration.ofMinutes(10)).build();
    }

    public String accessToken(String token, java.time.Instant expiresAt) {
        var cookie = base(ACCESS_TOKEN_COOKIE, token, "Lax")
                .maxAge(Duration.ofMinutes(15))
                .build();
        var expires = java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME
                .format(expiresAt.atZone(java.time.ZoneOffset.UTC));
        return cookie + "; Expires=" + expires;
    }

    public ResponseCookie deleteAuthenticated() {
        return base(SESSION_COOKIE, "", "Lax").maxAge(Duration.ZERO).build();
    }

    public ResponseCookie deleteAuthFlow() {
        return base(AUTH_FLOW_COOKIE, "", "Strict").maxAge(Duration.ZERO).build();
    }

    public ResponseCookie deleteAccessToken() {
        return base(ACCESS_TOKEN_COOKIE, "", "Lax").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String name, String value, String sameSite) {
        return ResponseCookie.from(name, value)
                .secure(true)
                .httpOnly(true)
                .sameSite(sameSite)
                .path("/");
    }
}
