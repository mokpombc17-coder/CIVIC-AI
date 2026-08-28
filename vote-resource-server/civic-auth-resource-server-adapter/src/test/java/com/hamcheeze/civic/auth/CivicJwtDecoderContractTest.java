package com.hamcheeze.civic.auth;

import com.nimbusds.jose.jwk.RSAKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CivicJwtDecoderContractTest {

    private Instant now;
    private MutableClock clock;
    private CivicAuthProperties properties;
    private RSAKey key;

    @BeforeEach
    void setUp() throws Exception {
        now = Instant.parse("2026-08-28T00:00:00Z");
        clock = new MutableClock(now);
        properties = properties();
        key = TestTokenFactory.rsaKey("active-key");
    }

    @Test
    void acceptsAValidContractToken() throws Exception {
        JwtDecoder decoder = decoder(TestTokenFactory.jwks(key));

        Jwt jwt = decoder.decode(TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> { }));

        assertThat(jwt.getSubject())
                .isEqualTo("00000000-0000-0000-0000-000000000001");
        assertThat(jwt.getAudience())
                .containsExactly(CivicAuthContract.AUDIENCE);
    }

    @Test
    void rejectsAudienceWithAnExtraValue() throws Exception {
        JwtDecoder decoder = decoder(TestTokenFactory.jwks(key));
        String token = TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> claims.audience(List.of(
                        CivicAuthContract.AUDIENCE,
                        "other-api")));

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsAudienceSerializedAsAString() throws Exception {
        JwtDecoder decoder = decoder(TestTokenFactory.jwks(key));
        String token = TestTokenFactory.tokenWithRawAudience(
                key,
                now.minusSeconds(1),
                CivicAuthContract.AUDIENCE);

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsExpiredFutureAndWrongLifetimeTokens() throws Exception {
        JwtDecoder decoder = decoder(TestTokenFactory.jwks(key));
        String expired = TestTokenFactory.token(
                key,
                now.minusSeconds(900),
                claims -> { });
        String future = TestTokenFactory.token(
                key,
                now.plusSeconds(31),
                claims -> { });
        String wrongLifetime = TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> claims.expirationTime(
                        java.util.Date.from(now.plusSeconds(898))));

        assertThatThrownBy(() -> decoder.decode(expired))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(future))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(wrongLifetime))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsMalformedIdentityAndAuthorizationClaims() throws Exception {
        JwtDecoder decoder = decoder(TestTokenFactory.jwks(key));
        String nonCanonicalSubject = TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> claims.subject(
                        "00000000-0000-0000-0000-00000000000A"));
        String nonCanonicalEmail = TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> claims.claim("email", " User@example.com "));
        String duplicateScope = TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> claims.claim("scope", "chat:connect chat:connect"));
        String fractionalVersion = TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> claims.claim("account_state_version", 1.5));
        String missingPasswordState = TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> claims.claim("must_change_password", null));

        assertThatThrownBy(() -> decoder.decode(nonCanonicalSubject))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(nonCanonicalEmail))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(duplicateScope))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(fractionalVersion))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(missingPasswordState))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsWrongSignatureAndMissingJwtType() throws Exception {
        RSAKey attackerKey = TestTokenFactory.rsaKey("active-key");
        JwtDecoder decoder = decoder(TestTokenFactory.jwks(key));
        String wrongSignature = TestTokenFactory.token(
                attackerKey,
                now.minusSeconds(1),
                claims -> { });
        String missingType = TestTokenFactory.token(
                key,
                TestTokenFactory.validClaims(now.minusSeconds(1)).build(),
                null,
                key.getKeyID());

        assertThatThrownBy(() -> decoder.decode(wrongSignature))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> decoder.decode(missingType))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void refreshesOnceForAnUnknownKidAndBoundsNegativeRefreshes()
            throws Exception {
        RSAKey rotatingKey = TestTokenFactory.rsaKey("rotating-key");
        RSAKey unknownKey = TestTokenFactory.rsaKey("unknown-key");
        AtomicReference<String> document = new AtomicReference<>(
                TestTokenFactory.jwks(key));
        AtomicInteger loads = new AtomicInteger();
        JwtDecoder decoder = CivicJwtDecoderFactory.create(
                properties,
                () -> {
                    loads.incrementAndGet();
                    return document.get();
                },
                clock);

        decoder.decode(TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> { }));
        assertThat(loads).hasValue(1);

        clock.advanceSeconds(2);
        document.set(TestTokenFactory.jwks(key, rotatingKey));
        decoder.decode(TestTokenFactory.token(
                rotatingKey,
                now.minusSeconds(1),
                claims -> { }));
        assertThat(loads).hasValue(2);

        clock.advanceSeconds(2);
        String unknownToken = TestTokenFactory.token(
                unknownKey,
                now.minusSeconds(1),
                claims -> { });
        assertThatThrownBy(() -> decoder.decode(unknownToken))
                .isInstanceOf(JwtException.class);
        assertThat(loads).hasValue(3);

        clock.advanceSeconds(2);
        assertThatThrownBy(() -> decoder.decode(unknownToken))
                .isInstanceOf(JwtException.class);
        assertThat(loads).hasValue(3);
    }

    @Test
    void rejectsAWholeJwksDocumentContainingPrivateKeyMaterial()
            throws Exception {
        String privateJwks = new com.nimbusds.jose.jwk.JWKSet(key)
                .toString(false);
        JwtDecoder decoder = decoder(privateJwks);
        String token = TestTokenFactory.token(
                key,
                now.minusSeconds(1),
                claims -> { });

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(JwtException.class);
    }

    private JwtDecoder decoder(String jwks) {
        return CivicJwtDecoderFactory.create(
                properties,
                () -> jwks,
                clock);
    }

    static CivicAuthProperties properties() {
        CivicAuthProperties properties = new CivicAuthProperties();
        properties.setIssuer(URI.create("https://issuer.example"));
        properties.setJwksUri(URI.create(
                "https://issuer.example/.well-known/jwks.json"));
        properties.setBrowserOrigin(URI.create("https://app.example"));
        properties.validate();
        return properties;
    }
}
