package ai.civic.mainauth.token;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.time.Clock;
import java.util.Date;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public final class InternalTokenService {
    private static final Set<String> RAG_SCOPES = Set.of(
            "rag:documents:read", "rag:documents:write", "rag:queries:write", "rag:jobs:read");
    private final Es256KeyRing keyRing;
    private final String issuer;
    private final Clock clock;

    @Autowired
    public InternalTokenService(
            Es256KeyRing keyRing,
            @Value("${civic.issuer:https://localhost}") String issuer) {
        this(keyRing, issuer, Clock.systemUTC());
    }

    InternalTokenService(Es256KeyRing keyRing, String issuer, Clock clock) {
        this.keyRing = keyRing;
        this.issuer = issuer;
        this.clock = clock;
    }

    public String issueRagToken(
            UUID subject,
            long accountStateVersion,
            String role,
            Set<String> scopes) {
        if (subject == null || accountStateVersion < 0 || scopes == null || scopes.isEmpty()
                || !RAG_SCOPES.containsAll(scopes) || role == null || role.isBlank()) {
            throw new IllegalArgumentException("RAG token scope or subject is invalid");
        }
        try {
            var now = clock.instant();
            var claims = new JWTClaimsSet.Builder()
                    .issuer(issuer)
                    .audience("civic-rag")
                    .subject(subject.toString())
                    .claim("account_state_version", accountStateVersion)
                    .claim("role", role)
                    .claim("scopes", scopes.stream().sorted().toList())
                    .jwtID(UUID.randomUUID().toString())
                    .issueTime(Date.from(now))
                    .notBeforeTime(Date.from(now.minusSeconds(2)))
                    .expirationTime(Date.from(now.plusSeconds(60)))
                    .build();
            var header = new JWSHeader.Builder(JWSAlgorithm.ES256)
                    .type(new JOSEObjectType("civic-internal+jwt"))
                    .keyID(keyRing.active().getKeyID())
                    .build();
            var signed = new SignedJWT(header, claims);
            signed.sign(new ECDSASigner(keyRing.active()));
            return signed.serialize();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not issue ES256 service token", exception);
        }
    }
}
