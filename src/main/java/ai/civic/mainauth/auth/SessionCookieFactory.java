package ai.civic.mainauth.auth;

import java.time.Duration;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public final class SessionCookieFactory {
    public static final String SESSION_COOKIE = "__Host-civic-session";
    public static final String AUTH_FLOW_COOKIE = "__Host-civic-auth-flow";

    public ResponseCookie authenticated(String opaqueId, SessionService.SessionRole role) {
        var maxAge = role == SessionService.SessionRole.PARTICIPANT
                ? Duration.ofDays(7) : Duration.ofHours(12);
        return base(SESSION_COOKIE, opaqueId, "Lax").maxAge(maxAge).build();
    }

    public ResponseCookie authFlow(String opaqueId) {
        return base(AUTH_FLOW_COOKIE, opaqueId, "Strict").maxAge(Duration.ofMinutes(10)).build();
    }

    public ResponseCookie deleteAuthenticated() {
        return base(SESSION_COOKIE, "", "Lax").maxAge(Duration.ZERO).build();
    }

    public ResponseCookie deleteAuthFlow() {
        return base(AUTH_FLOW_COOKIE, "", "Strict").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String name, String value, String sameSite) {
        return ResponseCookie.from(name, value)
                .secure(true)
                .httpOnly(true)
                .sameSite(sameSite)
                .path("/");
    }
}
