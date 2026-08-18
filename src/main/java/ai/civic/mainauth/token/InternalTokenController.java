package ai.civic.mainauth.token;

import ai.civic.mainauth.auth.CsrfService;
import ai.civic.mainauth.auth.SessionCookieFactory;
import ai.civic.mainauth.auth.SessionService;
import ai.civic.mainauth.feature.RuntimeFeatureGateService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/tokens")
public class InternalTokenController {
    public static final String INTERNAL_SECRET_HEADER = "X-CIVIC-Internal-Client-Secret";
    private final InternalTokenService tokens;
    private final SessionService sessions;
    private final CsrfService csrf;
    private final RuntimeFeatureGateService featureGates;
    private final byte[] internalSecret;

    public InternalTokenController(
            InternalTokenService tokens,
            SessionService sessions,
            CsrfService csrf,
            RuntimeFeatureGateService featureGates,
            @Value("${civic.internal.client-secret:local-development-internal-client-secret}") String internalSecret) {
        this.tokens = tokens;
        this.sessions = sessions;
        this.csrf = csrf;
        this.featureGates = featureGates;
        this.internalSecret = internalSecret.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping
    ResponseEntity<TokenView> issue(
            @RequestHeader(INTERNAL_SECRET_HEADER) String suppliedInternalSecret,
            @RequestHeader("X-CSRF-Token") String csrfToken,
            @RequestHeader(value = "X-Request-ID", defaultValue = "missing-request-id") String requestId,
            @CookieValue(SessionCookieFactory.SESSION_COOKIE) String sessionId,
            @RequestBody TokenRequest request) {
        if (!MessageDigest.isEqual(
                internalSecret, suppliedInternalSecret.getBytes(StandardCharsets.UTF_8))) {
            throw new SecurityException("Internal client authentication failed");
        }
        if (!"civic-rag".equals(request.audience()) || !csrf.matches(sessionId, csrfToken)) {
            throw new SecurityException("Internal token request is invalid");
        }
        var session = sessions.require(sessionId);
        if (session.mustChangePassword()) {
            throw new SecurityException("Password rotation is required before issuing internal tokens");
        }
        var permittedScopes = permittedRagScopes(session.role());
        if (request.scopes() == null || !permittedScopes.containsAll(request.scopes())) {
            throw new SecurityException("Requested RAG scopes are not permitted for this session");
        }
        var token = tokens.issueRagToken(
                session.userId(), session.accountStateVersion(), session.role().name(), request.scopes(), requestId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new TokenView(token, Instant.now().plusSeconds(60)));
    }

    private Set<String> permittedRagScopes(SessionService.SessionRole role) {
        if (role == SessionService.SessionRole.PARTICIPANT) {
            featureGates.requireEnabled("RAG_PARTICIPANT_QUERY_ENABLED");
        }
        return allowedRagScopes(role);
    }

    static Set<String> allowedRagScopes(SessionService.SessionRole role) {
        return switch (role) {
            case PARTICIPANT -> Set.of("rag:documents:read", "rag:queries:write", "rag:jobs:read");
            case RAG_ADMIN, ADMIN, HIGHEST_ADMIN -> Set.of(
                    "rag:documents:read", "rag:documents:write", "rag:queries:write", "rag:jobs:read");
        };
    }

    record TokenRequest(String audience, Set<String> scopes) {}
    record TokenView(String token, Instant expiresAt) {}
}
