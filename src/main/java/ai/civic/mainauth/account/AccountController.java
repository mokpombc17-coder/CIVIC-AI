package ai.civic.mainauth.account;

import ai.civic.mainauth.auth.AuthenticationFlowService;
import ai.civic.mainauth.auth.BrowserRequestPolicy;
import ai.civic.mainauth.auth.BrowserRequestRejectedException;
import ai.civic.mainauth.auth.CsrfService;
import ai.civic.mainauth.auth.SessionCookieFactory;
import ai.civic.mainauth.auth.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/account")
public class AccountController {
    private final SessionService sessions;
    private final CsrfService csrf;
    private final BrowserRequestPolicy browser;
    private final AccountProfileService profiles;
    private final AuthenticationFlowService authentication;
    private final AccountLifecycleService lifecycle;
    private final SessionCookieFactory cookies;

    public AccountController(
            SessionService sessions,
            CsrfService csrf,
            BrowserRequestPolicy browser,
            AccountProfileService profiles,
            AuthenticationFlowService authentication,
            AccountLifecycleService lifecycle,
            SessionCookieFactory cookies) {
        this.sessions = sessions;
        this.csrf = csrf;
        this.browser = browser;
        this.profiles = profiles;
        this.authentication = authentication;
        this.lifecycle = lifecycle;
        this.cookies = cookies;
    }

    @GetMapping("/profile")
    ResponseEntity<AccountProfileService.AccountProfile> profile(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        browser.rejectPublicAuthorization(authorization);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate())
                .body(profiles.get(sessions.require(sessionId)));
    }

    @PatchMapping("/profile")
    AccountProfileService.AccountProfile updateProfile(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody ProfileUpdate body,
            HttpServletRequest request) {
        var session = requireMutation(sessionId, csrfToken, request);
        return profiles.update(
                sessionId, session, body.preferredLanguage(), body.ragAnswerDetail());
    }

    @PutMapping("/password")
    ResponseEntity<Void> changePassword(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody PasswordChange body,
            HttpServletRequest request) {
        var session = requireMutation(sessionId, csrfToken, request);
        authentication.changePassword(session.userId(), body.currentPassword(), body.newPassword());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthenticated().toString())
                .build();
    }

    @PostMapping("/2fa/enable")
    ResponseEntity<?> enableTwoFactor(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @CookieValue(value = SessionCookieFactory.AUTH_FLOW_COOKIE, required = false) String authFlow,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody CodeBody body,
            HttpServletRequest request) {
        var session = requireMutation(sessionId, csrfToken, request);
        if (authFlow == null) {
            var profile = profiles.get(session);
            var flow = authentication.requestTwoFactorEnable(session.userId(), profile.email());
            return ResponseEntity.accepted()
                    .header(HttpHeaders.SET_COOKIE, cookies.authFlow(flow.toString()).toString())
                    .body(Map.of("next", "EMAIL_CODE"));
        }
        authentication.enableTwoFactor(
                sessionId, session.userId(), UUID.fromString(authFlow), body.code());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString()).build();
    }

    @PostMapping("/2fa/disable")
    ResponseEntity<Void> disableTwoFactor(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody PasswordConfirmation body,
            HttpServletRequest request) {
        var session = requireMutation(sessionId, csrfToken, request);
        authentication.disableTwoFactor(session.userId(), body.password());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthenticated().toString())
                .build();
    }

    @PostMapping("/deactivate")
    ResponseEntity<Void> deactivate(
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody PasswordConfirmation body,
            HttpServletRequest request) {
        var session = requireMutation(sessionId, csrfToken, request);
        lifecycle.deactivateSelf(session.userId(), session.userId(), body.password());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthenticated().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString()).build();
    }

    private SessionService.SessionView requireMutation(
            String sessionId, String csrfToken, HttpServletRequest request) {
        var session = sessions.require(sessionId);
        if (!csrf.matches(sessionId, csrfToken)) throw new BrowserRequestRejectedException("CSRF token is invalid");
        browser.requireAuthenticatedMutation(new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN),
                request.getHeader("Sec-Fetch-Site"), request.getContentType(),
                request.getHeader(HttpHeaders.AUTHORIZATION)), csrfToken, csrfToken);
        return session;
    }

    record ProfileUpdate(String preferredLanguage, String ragAnswerDetail) {}
    record PasswordChange(String currentPassword, String newPassword) {}
    record PasswordConfirmation(String password) {}
    record CodeBody(String code) {}
}
