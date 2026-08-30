package ai.civic.mainauth.account;

import ai.civic.mainauth.auth.AuthenticationFlowService;
import ai.civic.mainauth.auth.AuthCookieFactory;
import ai.civic.mainauth.auth.AuthenticatedUserService;
import ai.civic.mainauth.auth.AuthorizationException;
import ai.civic.mainauth.auth.BrowserRequestPolicy;
import ai.civic.mainauth.auth.BrowserRequestRejectedException;
import ai.civic.mainauth.auth.CsrfService;
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
    private final AuthenticatedUserService authenticatedUsers;
    private final CsrfService csrf;
    private final BrowserRequestPolicy browser;
    private final AccountProfileService profiles;
    private final AuthenticationFlowService authentication;
    private final AccountLifecycleService lifecycle;
    private final AuthCookieFactory cookies;

    public AccountController(
            AuthenticatedUserService authenticatedUsers,
            CsrfService csrf,
            BrowserRequestPolicy browser,
            AccountProfileService profiles,
            AuthenticationFlowService authentication,
            AccountLifecycleService lifecycle,
            AuthCookieFactory cookies) {
        this.authenticatedUsers = authenticatedUsers;
        this.csrf = csrf;
        this.browser = browser;
        this.profiles = profiles;
        this.authentication = authentication;
        this.lifecycle = lifecycle;
        this.cookies = cookies;
    }

    @GetMapping("/profile")
    ResponseEntity<AccountProfileService.AccountProfile> profile(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        browser.rejectPublicAuthorization(authorization);
        var user = authenticatedUsers.require(accessToken);
        requireCompletedPasswordRotation(user);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate())
                .body(profiles.get(user));
    }

    @PatchMapping("/profile")
    AccountProfileService.AccountProfile updateProfile(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody ProfileUpdate body,
            HttpServletRequest request) {
        var user = requireMutation(accessToken, csrfToken, request);
        requireCompletedPasswordRotation(user);
        return profiles.update(user, body.preferredLanguage(), body.ragAnswerDetail());
    }

    @PutMapping("/password")
    ResponseEntity<Void> changePassword(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody PasswordChange body,
            HttpServletRequest request) {
        var user = requireMutation(accessToken, csrfToken, request);
        authentication.changePassword(user.userId(), body.currentPassword(), body.newPassword());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteRefreshToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deletePwaRefreshToken().toString())
                .build();
    }

    @PostMapping("/2fa/enable")
    ResponseEntity<?> enableTwoFactor(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @CookieValue(value = AuthCookieFactory.AUTH_FLOW_COOKIE, required = false) String authFlow,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody CodeBody body,
            HttpServletRequest request) {
        var user = requireMutation(accessToken, csrfToken, request);
        requireCompletedPasswordRotation(user);
        if (authFlow == null) {
            var profile = profiles.get(user);
            var flow = authentication.requestTwoFactorEnable(user.userId(), profile.email());
            return ResponseEntity.accepted()
                    .header(HttpHeaders.SET_COOKIE, cookies.authFlow(flow.toString()).toString())
                    .body(Map.of("next", "EMAIL_CODE"));
        }
        authentication.enableTwoFactor(user.userId(), UUID.fromString(authFlow), body.code());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString()).build();
    }

    @PostMapping("/2fa/disable")
    ResponseEntity<Void> disableTwoFactor(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody PasswordConfirmation body,
            HttpServletRequest request) {
        var user = requireMutation(accessToken, csrfToken, request);
        requireCompletedPasswordRotation(user);
        authentication.disableTwoFactor(user.userId(), body.password());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteRefreshToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deletePwaRefreshToken().toString())
                .build();
    }

    @PostMapping("/deactivate")
    ResponseEntity<Void> deactivate(
            @CookieValue(AuthCookieFactory.ACCESS_TOKEN_COOKIE) String accessToken,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestBody PasswordConfirmation body,
            HttpServletRequest request) {
        var user = requireMutation(accessToken, csrfToken, request);
        requireCompletedPasswordRotation(user);
        lifecycle.deactivateSelf(user.userId(), user.userId(), body.password());
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAuthFlow().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteRefreshToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deletePwaRefreshToken().toString())
                .build();
    }

    private AuthenticatedUserService.AuthenticatedUser requireMutation(
            String accessToken, String csrfToken, HttpServletRequest request) {
        var user = authenticatedUsers.require(accessToken);
        if (!csrf.matches(user, csrfToken)) throw new BrowserRequestRejectedException("CSRF token is invalid");
        browser.requireAuthenticatedMutation(new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN),
                request.getHeader("Sec-Fetch-Site"), request.getContentType(),
                request.getHeader(HttpHeaders.AUTHORIZATION)), csrfToken, csrfToken);
        return user;
    }

    private void requireCompletedPasswordRotation(
            AuthenticatedUserService.AuthenticatedUser user) {
        if (user.mustChangePassword()) {
            throw new AuthorizationException("Password rotation is required");
        }
    }

    record ProfileUpdate(String preferredLanguage, String ragAnswerDetail) {}
    record PasswordChange(String currentPassword, String newPassword) {}
    record PasswordConfirmation(String password) {}
    record CodeBody(String code) {}
}
