package ai.civic.mainauth.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth/pwa")
public class PwaAuthController {
    private final AuthenticationFlowService authentication;
    private final CredentialIssuanceService credentialIssuance;
    private final PwaRefreshTokenService refreshTokens;
    private final AuthCookieFactory cookies;
    private final BrowserRequestPolicy browserPolicy;
    private final TrustedClientAddressResolver clientAddresses;
    private final PreSessionRateLimitService preSessionRateLimits;

    public PwaAuthController(
            AuthenticationFlowService authentication,
            CredentialIssuanceService credentialIssuance,
            PwaRefreshTokenService refreshTokens,
            AuthCookieFactory cookies,
            BrowserRequestPolicy browserPolicy,
            TrustedClientAddressResolver clientAddresses,
            PreSessionRateLimitService preSessionRateLimits) {
        this.authentication = authentication;
        this.credentialIssuance = credentialIssuance;
        this.refreshTokens = refreshTokens;
        this.cookies = cookies;
        this.browserPolicy = browserPolicy;
        this.clientAddresses = clientAddresses;
        this.preSessionRateLimits = preSessionRateLimits;
    }

    @PostMapping("/login")
    ResponseEntity<Void> login(
            @CookieValue(value = AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE, required = false)
                    String previousRefreshToken,
            @RequestBody LoginBody body,
            HttpServletRequest request) {
        requireMutation(request);
        preSessionRateLimits.checkAndRecord(body.email(), clientAddresses.resolve(request));
        var result = authentication.loginPwaWithoutSecondFactor(
                body.email(), body.password(), clientAddresses.resolve(request));
        refreshTokens.revokeSession(previousRefreshToken, "REAUTHENTICATED");
        return authenticated(credentialIssuance.issueForPwaLogin(result.userId()));
    }

    @PostMapping("/refresh")
    ResponseEntity<Void> refresh(
            @CookieValue(AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE) String refreshToken,
            HttpServletRequest request) {
        requireMutation(request);
        return authenticated(credentialIssuance.refreshPwa(refreshToken));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(
            @CookieValue(value = AuthCookieFactory.PWA_REFRESH_TOKEN_COOKIE, required = false)
                    String refreshToken,
            HttpServletRequest request) {
        requireMutation(request);
        refreshTokens.revokeSession(refreshToken, "LOGOUT");
        return ResponseEntity.noContent()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookies.deleteAccessToken().toString())
                .header(HttpHeaders.SET_COOKIE, cookies.deletePwaRefreshToken().toString())
                .build();
    }

    private ResponseEntity<Void> authenticated(CredentialIssuanceService.IssuedCredentials issued) {
        return ResponseEntity.noContent()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE,
                        cookies.accessToken(issued.accessToken(), issued.accessExpiresAt()))
                .header(HttpHeaders.SET_COOKIE,
                        cookies.pwaRefreshToken(issued.refreshToken(), issued.refreshExpiresAt()))
                .build();
    }

    private void requireMutation(HttpServletRequest request) {
        browserPolicy.requirePreSessionMutation(new BrowserRequestPolicy.RequestMetadata(
                request.getMethod(), request.getHeader(HttpHeaders.ORIGIN),
                request.getHeader("Sec-Fetch-Site"), request.getContentType(),
                request.getHeader(HttpHeaders.AUTHORIZATION)));
    }

    record LoginBody(String email, String password) {}
}
