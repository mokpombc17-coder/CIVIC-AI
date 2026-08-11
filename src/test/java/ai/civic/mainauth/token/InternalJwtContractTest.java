package ai.civic.mainauth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.SignedJWT;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InternalJwtContractTest {
    private static final Instant NOW = Instant.parse("2026-08-11T12:00:00Z");

    @Test
    void ragTokenHasExactShortLivedSingleAudienceClaimsAndValidEs256Signature() throws Exception {
        var key = new ECKeyGenerator(Curve.P_256).keyID("active-2026-08").generate();
        var tokens = new InternalTokenService(
                new Es256KeyRing(key, java.util.List.of()), "https://auth.civic.example",
                Clock.fixed(NOW, ZoneOffset.UTC));
        var userId = UUID.randomUUID();

        var serialized = tokens.issueRagToken(
                userId, 7, "PARTICIPANT", Set.of("rag:documents:read"), "request-01");
        var jwt = SignedJWT.parse(serialized);
        var claims = jwt.getJWTClaimsSet();

        assertThat(jwt.getHeader().getAlgorithm().getName()).isEqualTo("ES256");
        assertThat(jwt.getHeader().getType()).isEqualTo(new JOSEObjectType("civic-internal+jwt"));
        assertThat(jwt.getHeader().getKeyID()).isEqualTo("active-2026-08");
        assertThat(jwt.verify(new ECDSAVerifier(key.toECPublicKey()))).isTrue();
        assertThat(claims.getIssuer()).isEqualTo("https://auth.civic.example");
        assertThat(claims.getAudience()).containsExactly("civic-rag");
        assertThat(claims.getSubject()).isEqualTo(userId.toString());
        assertThat(claims.getLongClaim("account_state_version")).isEqualTo(7);
        assertThat(claims.getStringClaim("role")).isEqualTo("PARTICIPANT");
        assertThat(claims.getStringListClaim("scopes")).containsExactly("rag:documents:read");
        assertThat(claims.getStringClaim("request_id")).isEqualTo("request-01");
        assertThat(claims.getJWTID()).isNotBlank();
        assertThat(claims.getExpirationTime().toInstant().getEpochSecond()
                - claims.getIssueTime().toInstant().getEpochSecond()).isLessThanOrEqualTo(60);
    }

    @Test
    void issuanceRejectsUnknownOrOverBroadScopeAndJwksNeverContainsPrivateMaterial() throws Exception {
        var key = new ECKeyGenerator(Curve.P_256).keyID("active").generate();
        var ring = new Es256KeyRing(key, java.util.List.of());
        var tokens = new InternalTokenService(ring, "https://auth.civic.example", Clock.systemUTC());
        assertThatThrownBy(() -> tokens.issueRagToken(
                        UUID.randomUUID(), 0, "PARTICIPANT", Set.of("admin:*"), "request-01"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(ring.publicJwks().toString()).doesNotContain("\"d\"");
    }
}
