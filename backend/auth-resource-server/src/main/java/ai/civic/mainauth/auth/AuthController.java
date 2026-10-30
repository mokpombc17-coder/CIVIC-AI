package ai.civic.mainauth.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
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
    private final AuthenticatedUserService authenticatedUsers;
    private final RefreshTokenService refreshTokens;
    private final SessionRevocationService sessions;
    private final CredentialIssuanceService credentialIssuance;
    private final AuthCookieFactory cookies;
    private final CsrfService csrf;
    private final BrowserRequestPolicy browserPolicy;
    private final TrustedClientAddressResolver clientAddresses;
    private final PreSessionRateLimitService preSessionRateLimits;

    public AuthController(
            AuthenticationFlowService authentication,
            AuthenticatedUserService authenticatedUsers,
            RefreshTokenService refreshTokens,
            SessionRevocationService sessions,
            CredentialIssuanceService credentialIssuance,
            AuthCookieFactory cookies,
            CsrfService csrf,
            BrowserRequestPolicy browserPolicy,
            TrustedClientAddressResolver clientAddresses,
            PreSessionRateLimitService preSessionRateLimits) {
        this.authentication = authentication;
        this.authenticatedUsers = authenticatedUsers;
        this.refreshTokens = refreshTokens;
        this.sessions = sessions;
        this.credentialIssuance = credentialIssuance;
        this.cookies = cookies;
        this.csrf = csrf;
        this.browserPolicy = browserPolicy;
        this.clientAddresses = clientAddresses;
        this.preSessionRateLimits = preSessionRateLimits;
    }

    @PostMapping("/login")
    ResponseEntity<?> login(
            @CookieValue(value = AuthCookieFactory.REFRESH_TOKEN_COOKIE, required = false)
                    String previousRefreshToken,
            @RequestBody LoginBody body,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, body.email());
        var result = authentication.login(
                body.email(), body.password(), clientAddresses.resolve(request));
        refreshTokens.revokeFamily(previousRefreshToken, "REAUTHENTICATED");
        if (result.next() == AuthenticationFlowService.Next.TWO_FACTOR) {
            return ResponseEntity.accepted()
                    .header(HttpHeaders.SET_COOKIE, cookies.authFlow(result.authFlowId()).toString())
                    .header(HttpHeaders.SET_COOKIE, cookies.deleteAccessToken().toString())
                    .header(HttpHeaders.SET_COOKIE, cookies.deleteRefreshToken().toString())
                    .body(Map.of("next", "TWO_FACTOR"));
        }
        return authenticated(result, false);
    }

    @PostMapping("/2fa/verify")
    ResponseEntity<Void> verifyTwoFactor(
            @CookieValue(AuthCookieFactory.AUTH_FLOW_COOKIE) String flow,
            @RequestBody CodeBody body,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, flow);
        return authenticated(authentication.verifyTwoFactor(UUID.fromString(flow), body.code()), true);
    }

    @PostMapping("/2fa/resend")
    ResponseEntity<Void> resendTwoFactor(
            @CookieValue(AuthCookieFactory.AUTH_FLOW_COOKIE) String flow,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, flow);
        authentication.resend(UUID.fromString(flow), "TWO_FACTOR");
        return ResponseEntity.accepted()
                .header(HttpHeaders.SET_COOKIE, cookies.authFlow(flow).toString())
                .build();
    }

    @GetMapping("/me")
    ResponseEntity<MeBody> me(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        browserPolicy.rejectPublicAuthorization(authorization);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(MeBody.from(authenticatedUsers.require(accessToken)));
    }

    @GetMapping("/csrf")
    ResponseEntity<Map<String, String>> csrf(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        browserPolicy.rejectPublicAuthorization(authorization);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(Map.of("csrf_token", csrf.issue(authenticatedUsers.require(accessToken))));
    }

    @PostMapping("/refresh")
    ResponseEntity<Void> refresh(
            @CookieValue(AuthCookieFactory.REFRESH_TOKEN_COOKIE) String refreshToken,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        var issued = credentialIssuance.refresh(refreshToken);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE,
                        cookies.accessToken(issued.accessToken(), issued.accessExpiresAt()))
                .header(HttpHeaders.SET_COOKIE,
                        cookies.refreshToken(issued.refreshToken(), issued.refreshExpiresAt()))
                .build();
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(
            @CookieValue(value = AuthCookieFactory.REFRESH_TOKEN_COOKIE, required = false) String refreshToken,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        refreshTokens.revokeFamily(refreshToken, "LOGOUT");
        return clearedCredentials();
    }

    @PostMapping("/logout-all")
    ResponseEntity<Void> logoutAll(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            HttpServletRequest request) {
        var user = requireAuthenticatedMutation(request, accessToken, csrfToken);
        sessions.revokeAll(user.userId(), "LOGOUT_ALL");
        return clearedAllCredentials();
    }

    @PostMapping("/password-reset/request")
    ResponseEntity<PasswordResetBody> requestPasswordReset(
            @RequestBody EmailBody body, HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, body.email());
        var started = authentication.startPasswordReset(body.email());
        return ResponseEntity.accepted()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookies.authFlow(started.flowId().toString()).toString())
                .body(PasswordResetBody.from(started.maskedEmail(), started.schedule()));
    }

    @PostMapping("/password-reset/resend")
    ResponseEntity<PasswordResetBody> resendPasswordReset(
            @CookieValue(AuthCookieFactory.AUTH_FLOW_COOKIE) String flow,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, flow);
        var schedule = authentication.resendPasswordReset(UUID.fromString(flow));
        return ResponseEntity.accepted()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookies.authFlow(flow).toString())
                .body(PasswordResetBody.from(null, schedule));
    }

    @PostMapping("/password-reset/verify")
    ResponseEntity<Void> verifyPasswordReset(
            @CookieValue(AuthCookieFactory.AUTH_FLOW_COOKIE) String flow,
            @RequestBody CodeBody body,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, flow);
        authentication.verifyPasswordReset(UUID.fromString(flow), body.code());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.authFlow(flow).toString())
                .build();
    }

    @PostMapping("/password-reset/complete")
    ResponseEntity<Void> completePasswordReset(
            @CookieValue(AuthCookieFactory.AUTH_FLOW_COOKIE) String flow,
            @RequestBody ResetBody body,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, flow);
        if (body.code() == null) {
            authentication.completePasswordReset(UUID.fromString(flow), body.newPassword());
        } else {
            authentication.completePasswordReset(UUID.fromString(flow), body.code(), body.newPassword());
        }
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteRefreshToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deletePwaRefreshToken().toString())
                .build();
    }

    @PostMapping("/reactivation/request")
    ResponseEntity<Void> requestReactivation(@RequestBody ReactivationBody body, HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, body.email());
        var flow = authentication.requestReactivation(body.email(), body.password());
        return ResponseEntity.accepted()
                .header(HttpHeaders.SET_COOKIE, cookies.authFlow(flow.toString()).toString()).build();
    }

    @PostMapping("/reactivation/complete")
    ResponseEntity<Void> completeReactivation(
            @CookieValue(AuthCookieFactory.AUTH_FLOW_COOKIE) String flow,
            @RequestBody CodeBody body,
            HttpServletRequest request) {
        requireUnauthenticatedMutation(request);
        rateLimit(request, flow);
        authentication.completeReactivation(UUID.fromString(flow), body.code());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString()).build();
    }

    private void requireUnauthenticatedMutation(HttpServletRequest request) {
        browserPolicy.requirePreSessionMutation(metadata(request));
    }

    private AuthenticatedUserService.AuthenticatedUser requireAuthenticatedMutation(
            HttpServletRequest request, String accessToken, String csrfToken) {
        var user = authenticatedUsers.require(accessToken);
        if (!csrf.matches(user, csrfToken)) {
            throw new BrowserRequestRejectedException("CSRF token is invalid");
        }
        browserPolicy.requireAuthenticatedMutation(metadata(request), csrfToken, csrfToken);
        return user;
    }

    private ResponseEntity<Void> authenticated(
            AuthenticationFlowService.LoginResult result,
            boolean deleteAuthFlow) {
        var issued = credentialIssuance.issueForLogin(result.userId());
        var response = ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE,
                        cookies.accessToken(issued.accessToken(), issued.accessExpiresAt()))
                .header(HttpHeaders.SET_COOKIE,
                        cookies.refreshToken(issued.refreshToken(), issued.refreshExpiresAt()));
        if (deleteAuthFlow) {
            response.header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString());
        }
        return response.build();
    }

    private ResponseEntity<Void> clearedCredentials() {
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteRefreshToken().toString())
                .build();
    }

    private ResponseEntity<Void> clearedAllCredentials() {
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteRefreshToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deletePwaRefreshToken().toString())
                .build();
    }

    private void rateLimit(HttpServletRequest request, String identity) {
        preSessionRateLimits.checkAndRecord(identity, clientAddresses.resolve(request));
    }

    private BrowserRequestPolicy.RequestMetadata metadata(HttpServletRequest request) {
        return new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN),
                request.getHeader("Sec-Fetch-Site"), request.getContentType(),
                request.getHeader(HttpHeaders.AUTHORIZATION));
    }

    record LoginBody(String email, String password) {}
    record EmailBody(String email) {}
    record ReactivationBody(String email, String password) {}
    record CodeBody(String code) {}
    record ResetBody(String code, String newPassword) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record PasswordResetBody(String maskedEmail, Instant expiresAt, Instant resendAvailableAt) {
        static PasswordResetBody from(
                String maskedEmail, AuthenticationFlowService.PasswordResetSchedule schedule) {
            return new PasswordResetBody(maskedEmail, schedule.expiresAt(), schedule.resendAvailableAt());
        }
    }
    record MeBody(
            UUID userId,
            String role,
            java.util.Set<String> permissions,
            String accountState,
            boolean mustChangePassword) {
        static MeBody from(AuthenticatedUserService.AuthenticatedUser user) {
            return new MeBody(
                    user.userId(), user.role().name(), user.permissions(),
                    user.accountState(), user.mustChangePassword());
        }
    }
}
