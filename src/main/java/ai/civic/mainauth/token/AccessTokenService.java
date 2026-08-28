package ai.civic.mainauth.token;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSObject;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.Payload;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public final class AccessTokenService {
    public static final String AUDIENCE = "civic-ai-api";
    public static final Duration LIFETIME = Duration.ofMinutes(15);

    private static final List<String> PARTICIPANT_SCOPES = List.of(
            "chat:connect",
            "chat:rooms:read",
            "chat:rooms:write",
            "chat:messages:write",
            "chat:read-state:write",
            "vote:surveys:read",
            "vote:survey-responses:write",
            "vote:personas:read",
            "vote:tasks:read",
            "vote:predictions:write",
            "vote:submissions:read",
            "vote:submissions:write",
            "rag:documents:read",
            "rag:queries:write",
            "rag:jobs:read");
    private static final List<String> CHAT_ADMIN_SCOPES = List.of(
            "chat:rooms:approve",
            "chat:categories:manage",
            "chat:rooms:membership-limit:exempt",
            "chat:audit:exports",
            "chat:research:exports");
    private static final List<String> VOTE_ADMIN_SCOPES = List.of(
            "vote:tasks:admin",
            "vote:survey-outbox-replays:write",
            "vote:persona-generation-retries:write");
    private static final List<String> SIMULATION_ADMIN_SCOPES = List.of(
            "simulation:tasks:read",
            "simulation:tasks:run",
            "simulation:billing:read",
            "simulation:billing:write");

    private final Rs256KeyRing keyRing;
    private final String issuer;
    private final Clock clock;

    @Autowired
    public AccessTokenService(
            Rs256KeyRing keyRing,
            @Value("${civic.issuer:https://localhost}") String issuer) {
        this(keyRing, issuer, Clock.systemUTC());
    }

    AccessTokenService(Rs256KeyRing keyRing, String issuer, Clock clock) {
        this.keyRing = keyRing;
        this.issuer = issuer;
        this.clock = clock;
    }

    public IssuedAccessToken issue(
            UUID userId,
            String subjectEmail,
            long accountStateVersion,
            java.util.Set<String> permissions) {
        return issue(userId, subjectEmail, accountStateVersion, permissions, false);
    }

    public IssuedAccessToken issue(
            UUID userId,
            String subjectEmail,
            long accountStateVersion,
            java.util.Set<String> permissions,
            boolean mustChangePassword) {
        if (userId == null || subjectEmail == null || subjectEmail.isBlank()
                || accountStateVersion < 0 || permissions == null) {
            throw new IllegalArgumentException("Access token subject and account state are required");
        }
        try {
            var now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
            var expiresAt = now.plus(LIFETIME);
            var scope = mustChangePassword
                    ? "account:password:write"
                    : String.join(" ", scopesForPermissions(permissions));
            var claims = new JWTClaimsSet.Builder()
                    .issuer(issuer)
                    .audience(List.of(AUDIENCE))
                    .subject(userId.toString())
                    .issueTime(Date.from(now))
                    .expirationTime(Date.from(expiresAt))
                    .jwtID(UUID.randomUUID().toString())
                    .claim("email", subjectEmail)
                    .claim("scope", scope)
                    .claim("account_state_version", accountStateVersion)
                    .claim("must_change_password", mustChangePassword)
                    .build();
            var header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                    .type(JOSEObjectType.JWT)
                    .keyID(keyRing.active().getKeyID())
                    .build();
            var payload = new java.util.LinkedHashMap<>(claims.toJSONObject());
            // Nimbus compacts a single audience to a JSON string by default. CIVIC's contract
            // requires aud to remain an array even when it has exactly one value.
            payload.put("aud", List.of(AUDIENCE));
            var signed = new JWSObject(header, new Payload(payload));
            signed.sign(new RSASSASigner(keyRing.active()));
            return new IssuedAccessToken(signed.serialize(), expiresAt);
        } catch (Exception exception) {
            throw new IllegalStateException("Could not issue RS256 access token", exception);
        }
    }

    public static List<String> scopesForPermissions(java.util.Set<String> permissions) {
        var scopes = new LinkedHashSet<>(PARTICIPANT_SCOPES);
        if (permissions.contains("RAG_ADMIN")) {
            scopes.add("rag:documents:write");
        }
        if (permissions.contains("CHAT_ADMIN")) {
            scopes.addAll(CHAT_ADMIN_SCOPES);
        }
        if (permissions.contains("VOTE_ADMIN")) {
            scopes.addAll(VOTE_ADMIN_SCOPES);
        }
        if (permissions.contains("SIMULATION_ADMIN")) {
            scopes.addAll(SIMULATION_ADMIN_SCOPES);
        }
        return List.copyOf(new ArrayList<>(scopes));
    }

    public record IssuedAccessToken(String token, Instant expiresAt) {}
}
