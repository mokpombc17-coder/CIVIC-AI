package ai.civic.mainauth.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import ai.civic.mainauth.token.AccessTokenService;
import ai.civic.mainauth.token.Rs256KeyRing;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSObject;
import com.nimbusds.jose.Payload;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AuthenticatedUserServiceTokenValidationTest {
    private static final Instant NOW = Instant.parse("2026-08-26T08:00:00Z");
    private static final String ISSUER = "https://auth.civic.example";
    private RSAKey key;
    private AuthenticatedUserService service;

    @BeforeEach
    void setUp() throws Exception {
        key = new RSAKeyGenerator(2048).keyID("active-2026-08").generate();
        service = new AuthenticatedUserService(
                mock(JdbcTemplate.class),
                new Rs256KeyRing(key, List.of()),
                ISSUER,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void rejectsSignedTokensThatDoNotMatchTheExactPlatformProfile() throws Exception {
        for (var malformed : List.of(
                token(List.of(AccessTokenService.AUDIENCE, "other"), Duration.ofMinutes(15),
                        UUID.randomUUID().toString(), "rag:queries:write", JOSEObjectType.JWT,
                        UUID.randomUUID().toString()),
                token(List.of(AccessTokenService.AUDIENCE), Duration.ofSeconds(901),
                        UUID.randomUUID().toString(), "rag:queries:write", JOSEObjectType.JWT,
                        UUID.randomUUID().toString()),
                token(List.of(AccessTokenService.AUDIENCE), Duration.ofMinutes(15),
                        "not-a-uuid", "rag:queries:write", JOSEObjectType.JWT,
                        UUID.randomUUID().toString()),
                token(List.of(AccessTokenService.AUDIENCE), Duration.ofMinutes(15),
                        UUID.randomUUID().toString(), "rag:queries:write  rag:jobs:read", JOSEObjectType.JWT,
                        UUID.randomUUID().toString()),
                token(List.of(AccessTokenService.AUDIENCE), Duration.ofMinutes(15),
                        UUID.randomUUID().toString(), "rag:queries:write", new JOSEObjectType("at+jwt"),
                        UUID.randomUUID().toString()),
                token(List.of(AccessTokenService.AUDIENCE), Duration.ofMinutes(15),
                        UUID.randomUUID().toString(), "rag:queries:write", JOSEObjectType.JWT,
                        UUID.randomUUID().toString().toUpperCase()))) {
            assertThatThrownBy(() -> service.require(malformed))
                    .isInstanceOf(AuthenticationException.class);
        }
    }

    private String token(
            List<String> audience,
            Duration lifetime,
            String jwtId,
            String scope,
            JOSEObjectType type,
            String subject) throws Exception {
        var payload = new LinkedHashMap<String, Object>();
        payload.put("iss", ISSUER);
        payload.put("aud", audience);
        payload.put("sub", subject);
        payload.put("email", "person@example.com");
        payload.put("iat", NOW.getEpochSecond());
        payload.put("exp", NOW.plus(lifetime).getEpochSecond());
        payload.put("jti", jwtId);
        payload.put("scope", scope);
        payload.put("account_state_version", 0);
        payload.put("must_change_password", false);
        var jwt = new JWSObject(
                new JWSHeader.Builder(JWSAlgorithm.RS256).type(type).keyID(key.getKeyID()).build(),
                new Payload(payload));
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }
}
