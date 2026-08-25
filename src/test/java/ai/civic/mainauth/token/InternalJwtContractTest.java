package ai.civic.mainauth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
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
    void participantScopesIncludeEveryResourceServerDefaultButNeverElevatedOperations() {
        assertThat(AccessTokenService.scopesForPermissions(Set.of()))
                .contains(
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
                        "rag:jobs:read")
                .doesNotContain(
                        "chat:rooms:membership-limit:exempt",
                        "chat:audit:exports",
                        "chat:research:exports",
                        "vote:survey-outbox-replays:write",
                        "vote:persona-generation-retries:write",
                        "rag:documents:write");
        assertThat(AccessTokenService.scopesForPermissions(Set.of("RAG_ADMIN")))
                .contains("rag:documents:write")
                .doesNotContain("chat:audit:exports");
        assertThat(AccessTokenService.scopesForPermissions(Set.of(
                        "RAG_ADMIN", "CHAT_ADMIN", "VOTE_ADMIN", "SIMULATION_ADMIN")))
                .contains(
                        "rag:documents:write",
                        "chat:rooms:membership-limit:exempt",
                        "chat:audit:exports",
                        "chat:research:exports",
                        "vote:survey-outbox-replays:write",
                        "vote:persona-generation-retries:write");
    }

    @Test
    void accessTokenHasExactCommonAudienceClaimsAndValidRs256Signature() throws Exception {
        var key = new RSAKeyGenerator(2048).keyID("active-2026-08").generate();
        var tokens = new AccessTokenService(
                new Rs256KeyRing(key, java.util.List.of()), "https://auth.civic.example",
                Clock.fixed(NOW, ZoneOffset.UTC));
        var userId = UUID.randomUUID();

        var issued = tokens.issue(userId, 7, Set.of());
        var jwt = SignedJWT.parse(issued.token());
        var claims = jwt.getJWTClaimsSet();

        assertThat(jwt.getHeader().getAlgorithm().getName()).isEqualTo("RS256");
        assertThat(jwt.getHeader().getType()).isEqualTo(JOSEObjectType.JWT);
        assertThat(jwt.getHeader().getKeyID()).isEqualTo("active-2026-08");
        assertThat(jwt.verify(new RSASSAVerifier(key.toRSAPublicKey()))).isTrue();
        assertThat(claims.getIssuer()).isEqualTo("https://auth.civic.example");
        assertThat(claims.getAudience()).containsExactly("civic-ai-api");
        assertThat(claims.getSubject()).isEqualTo(userId.toString());
        assertThat(claims.getLongClaim("account_state_version")).isEqualTo(7);
        assertThat(claims.getStringClaim("scope")).contains("chat:connect", "vote:surveys:read", "rag:queries:write");
        assertThat(claims.getClaim("roles")).isNull();
        assertThat(claims.getClaim("scopes")).isNull();
        assertThat(claims.getClaim("request_id")).isNull();
        assertThat(claims.getJWTID()).isNotBlank();
        assertThat(claims.getExpirationTime().toInstant().getEpochSecond()
                - claims.getIssueTime().toInstant().getEpochSecond()).isEqualTo(900);
        assertThat(issued.expiresAt()).isEqualTo(claims.getExpirationTime().toInstant());
    }

    @Test
    void issuanceRejectsInvalidSubjectAndJwksNeverContainsPrivateMaterial() throws Exception {
        var key = new RSAKeyGenerator(2048).keyID("active").generate();
        var ring = new Rs256KeyRing(key, java.util.List.of());
        var tokens = new AccessTokenService(ring, "https://auth.civic.example", Clock.systemUTC());
        assertThatThrownBy(() -> tokens.issue(null, 0, Set.of()))
                .isInstanceOf(IllegalArgumentException.class);
        var publicJwks = ring.publicJwks().toString();
        assertThat(publicJwks)
                .contains("\"alg\":\"RS256\"")
                .contains("\"use\":\"sig\"")
                .doesNotContain("\"d\"");
    }
}
