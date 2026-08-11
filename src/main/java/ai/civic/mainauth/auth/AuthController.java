package ai.civic.mainauth.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthenticationFlowService authentication;
    private final SessionService sessions;
    private final SessionCookieFactory cookies;
    private final CsrfService csrf;
    private final BrowserRequestPolicy browserPolicy;

    public AuthController(
            AuthenticationFlowService authentication,
            SessionService sessions,
            SessionCookieFactory cookies,
            CsrfService csrf,
            BrowserRequestPolicy browserPolicy) {
        this.authentication = authentication;
        this.sessions = sessions;
        this.cookies = cookies;
        this.csrf = csrf;
        this.browserPolicy = browserPolicy;
    }

    @PostMapping("/login")
    ResponseEntity<?> login(@RequestBody LoginBody body, HttpServletRequest request) {
        requirePreSession(request);
        var result = authentication.login(body.email(), body.password(), request.getRemoteAddr());
        if (result.next() == AuthenticationFlowService.Next.TWO_FACTOR) {
            return ResponseEntity.accepted()
                    .header(HttpHeaders.SET_COOKIE, cookies.authFlow(result.authFlowId()).toString())
                    .body(Map.of("next", "TWO_FACTOR"));
        }
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.authenticated(result.sessionId(), result.role()).toString())
                .build();
    }

    @PostMapping("/2fa/verify")
    ResponseEntity<Void> verifyTwoFactor(
            @CookieValue(SessionCookieFactory.AUTH_FLOW_COOKIE) String flow,
            @RequestBody CodeBody body,
            HttpServletRequest request) {
        requirePreSession(request);
        var result = authentication.verifyTwoFactor(UUID.fromString(flow), body.code());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.authenticated(result.sessionId(), result.role()).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString())
                .build();
    }

    @PostMapping("/2fa/resend")
    ResponseEntity<Void> resendTwoFactor(
            @CookieValue(SessionCookieFactory.AUTH_FLOW_COOKIE) String flow,
            HttpServletRequest request) {
        requirePreSession(request);
        authentication.resend(UUID.fromString(flow), "TWO_FACTOR");
        return ResponseEntity.accepted().build();
    }

    @GetMapping("/session")
    ResponseEntity<SessionBody> session(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        browserPolicy.rejectPublicAuthorization(authorization);
        var view = sessions.require(sessionId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(SessionBody.from(view));
    }

    @GetMapping("/csrf")
    ResponseEntity<Map<String, String>> csrf(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        browserPolicy.rejectPublicAuthorization(authorization);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(Map.of("csrf_token", csrf.issue(sessionId)));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            HttpServletRequest request) {
        requireAuthenticated(request, sessionId, csrfToken);
        sessions.revoke(sessionId, "LOGOUT");
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthenticated().toString()).build();
    }

    @PostMapping("/logout-all")
    ResponseEntity<Void> logoutAll(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            HttpServletRequest request) {
        requireAuthenticated(request, sessionId, csrfToken);
        sessions.revokeAll(sessions.require(sessionId).userId(), "LOGOUT_ALL");
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthenticated().toString()).build();
    }

    @PostMapping("/password-reset/request")
    ResponseEntity<Void> requestPasswordReset(@RequestBody EmailBody body, HttpServletRequest request) {
        requirePreSession(request);
        var flow = authentication.requestPasswordReset(body.email());
        return ResponseEntity.accepted()
                .header(HttpHeaders.SET_COOKIE, cookies.authFlow(flow.toString()).toString()).build();
    }

    @PostMapping("/password-reset/complete")
    ResponseEntity<Void> completePasswordReset(
            @CookieValue(SessionCookieFactory.AUTH_FLOW_COOKIE) String flow,
            @RequestBody ResetBody body,
            HttpServletRequest request) {
        requirePreSession(request);
        authentication.completePasswordReset(UUID.fromString(flow), body.code(), body.newPassword());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthenticated().toString()).build();
    }

    @PostMapping("/reactivation/request")
    ResponseEntity<Void> requestReactivation(@RequestBody EmailBody body, HttpServletRequest request) {
        requirePreSession(request);
        var flow = authentication.requestReactivation(body.email());
        return ResponseEntity.accepted()
                .header(HttpHeaders.SET_COOKIE, cookies.authFlow(flow.toString()).toString()).build();
    }

    @PostMapping("/reactivation/complete")
    ResponseEntity<Void> completeReactivation(
            @CookieValue(SessionCookieFactory.AUTH_FLOW_COOKIE) String flow,
            @RequestBody CodeBody body,
            HttpServletRequest request) {
        requirePreSession(request);
        authentication.completeReactivation(UUID.fromString(flow), body.code());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString()).build();
    }

    private void requirePreSession(HttpServletRequest request) {
        browserPolicy.requirePreSessionMutation(metadata(request));
    }

    private void requireAuthenticated(HttpServletRequest request, String sessionId, String csrfToken) {
        sessions.require(sessionId);
        if (!csrf.matches(sessionId, csrfToken)) throw new BrowserRequestRejectedException("CSRF token is invalid");
        browserPolicy.requireAuthenticatedMutation(metadata(request), csrfToken, csrfToken);
    }

    private BrowserRequestPolicy.RequestMetadata metadata(HttpServletRequest request) {
        return new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN),
                request.getHeader("Sec-Fetch-Site"), request.getContentType(),
                request.getHeader(HttpHeaders.AUTHORIZATION));
    }

    record LoginBody(String email, String password) {}
    record EmailBody(String email) {}
    record CodeBody(String code) {}
    record ResetBody(String code, String newPassword) {}
    record SessionBody(
            UUID userId,
            String role,
            String accountState,
            java.time.Instant idleExpiresAt,
            java.time.Instant absoluteExpiresAt,
            boolean mustChangePassword) {
        static SessionBody from(SessionService.SessionView view) {
            return new SessionBody(
                    view.userId(), view.role().name(), view.accountState(), view.idleExpiresAt(),
                    view.absoluteExpiresAt(), view.mustChangePassword());
        }
    }
}
