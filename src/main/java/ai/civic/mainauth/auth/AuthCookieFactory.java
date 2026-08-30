package ai.civic.mainauth.auth;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public final class AuthCookieFactory {
    public static final String AUTH_FLOW_COOKIE = "__Host-civic-auth-flow";
    public static final String ACCESS_TOKEN_COOKIE = "civic_ai_access_token";
    public static final String REFRESH_TOKEN_COOKIE = "civic_ai_refresh_token";
    public static final String REFRESH_TOKEN_PATH = "/api/v1/auth";
    public static final String PWA_REFRESH_TOKEN_COOKIE = "civic_ai_pwa_refresh_token";
    public static final String PWA_REFRESH_TOKEN_PATH = "/api/v1/auth/pwa";

    private final boolean secure;

    public AuthCookieFactory(@Value("${civic.cookies.secure:true}") boolean secure) {
        this.secure = secure;
    }

    public ResponseCookie authFlow(String opaqueId) {
        return base(AUTH_FLOW_COOKIE, opaqueId, "Strict", "/")
                .maxAge(Duration.ofMinutes(10)).build();
    }

    public String accessToken(String token, Instant expiresAt) {
        return expiringCookie(base(ACCESS_TOKEN_COOKIE, token, "Lax", "/"), expiresAt);
    }

    public String refreshToken(String token, Instant expiresAt) {
        return expiringCookie(
                base(REFRESH_TOKEN_COOKIE, token, "Lax", REFRESH_TOKEN_PATH), expiresAt);
    }

    public String pwaRefreshToken(String token, Instant expiresAt) {
        return expiringCookie(
                base(PWA_REFRESH_TOKEN_COOKIE, token, "Lax", PWA_REFRESH_TOKEN_PATH), expiresAt);
    }

    public ResponseCookie deleteAuthFlow() {
        return base(AUTH_FLOW_COOKIE, "", "Strict", "/").maxAge(Duration.ZERO).build();
    }

    public ResponseCookie deleteAccessToken() {
        return base(ACCESS_TOKEN_COOKIE, "", "Lax", "/").maxAge(Duration.ZERO).build();
    }

    public ResponseCookie deleteRefreshToken() {
        return base(REFRESH_TOKEN_COOKIE, "", "Lax", REFRESH_TOKEN_PATH)
                .maxAge(Duration.ZERO).build();
    }

    public ResponseCookie deletePwaRefreshToken() {
        return base(PWA_REFRESH_TOKEN_COOKIE, "", "Lax", PWA_REFRESH_TOKEN_PATH)
                .maxAge(Duration.ZERO).build();
    }

    private String expiringCookie(
            ResponseCookie.ResponseCookieBuilder builder, Instant expiresAt) {
        var cookie = builder.build();
        var expires = DateTimeFormatter.RFC_1123_DATE_TIME.format(expiresAt.atZone(ZoneOffset.UTC));
        return cookie + "; Expires=" + expires;
    }

    private ResponseCookie.ResponseCookieBuilder base(
            String name, String value, String sameSite, String path) {
        return ResponseCookie.from(name, value)
                .secure(secure)
                .httpOnly(true)
                .sameSite(sameSite)
                .path(path);
    }
}
