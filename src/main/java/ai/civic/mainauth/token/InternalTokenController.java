package ai.civic.mainauth.token;

import ai.civic.mainauth.auth.CsrfService;
import ai.civic.mainauth.auth.SessionCookieFactory;
import ai.civic.mainauth.auth.SessionService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;
import ai.civic.mainauth.auth.AuthenticationException;

@RestController
@RequestMapping("/internal/v1/tokens")
public class InternalTokenController {
    public static final String INTERNAL_SECRET_HEADER = "X-CIVIC-Internal-Client-Secret";
    private final AccessTokenService tokens;
    private final SessionService sessions;
    private final CsrfService csrf;
    private final SessionCookieFactory cookies;
    private final byte[] internalSecret;

    public InternalTokenController(
            AccessTokenService tokens,
            SessionService sessions,
            CsrfService csrf,
            SessionCookieFactory cookies,
            @Value("${civic.internal.client-secret:local-development-internal-client-secret}") String internalSecret) {
        this.tokens = tokens;
        this.sessions = sessions;
        this.csrf = csrf;
        this.cookies = cookies;
        this.internalSecret = internalSecret.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping
    @Transactional(noRollbackFor = AuthenticationException.class)
    public ResponseEntity<TokenView> issue(
            @RequestHeader(INTERNAL_SECRET_HEADER) String suppliedInternalSecret,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestBody TokenRequest request) {
        if (!MessageDigest.isEqual(
                internalSecret, suppliedInternalSecret.getBytes(StandardCharsets.UTF_8))) {
            throw new SecurityException("Internal client authentication failed");
        }
        if (!AccessTokenService.AUDIENCE.equals(request.audience()) || !csrf.matches(sessionId, csrfToken)) {
            throw new SecurityException("Internal token request is invalid");
        }
        var session = sessions.requireForTokenIssuance(sessionId);
        if (session.mustChangePassword()) {
            throw new SecurityException("Password rotation is required before issuing internal tokens");
        }
        var token = tokens.issue(session.userId(), session.accountStateVersion(), session.permissions());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE,
                        cookies.accessToken(token.token(), token.expiresAt()))
                .body(new TokenView(token.token(), token.expiresAt()));
    }

    record TokenRequest(String audience) {}
    record TokenView(String token, Instant expiresAt) {}
}
