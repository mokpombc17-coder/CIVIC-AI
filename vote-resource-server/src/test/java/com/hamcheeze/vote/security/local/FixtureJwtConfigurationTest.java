package com.hamcheeze.vote.security.local;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FixtureJwtConfigurationTest {

    private FixtureJwtProperties properties;
    private JwtDecoder decoder;

    @BeforeEach
    void setUp() {
        properties = new FixtureJwtProperties();
        decoder = new FixtureJwtConfiguration(properties)
                .fixtureJwtDecoder();
    }

    @Test
    void usesFrontendAuthenticationEmulatorDefaults() {
        assertThat(properties.getIssuer()).isEqualTo(
                "http://localhost:3000/api/dev/auth");
        assertThat(properties.getAudience()).isEqualTo("civic-ai-api");
    }

    @Test
    void acceptsExpectedIssuerAudienceAndSubject() throws Exception {
        String token = token(
                properties.getSecret(),
                "local-user-1",
                properties.getIssuer(),
                List.of(properties.getAudience()),
                Instant.now().plusSeconds(300),
                null);

        assertThat(decoder.decode(token).getSubject())
                .isEqualTo("local-user-1");
    }

    @Test
    void rejectsUnexpectedIssuer() throws Exception {
        String token = token(
                properties.getSecret(),
                "local-user-1",
                "other-issuer",
                List.of(properties.getAudience()),
                Instant.now().plusSeconds(300),
                null);

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsUnexpectedAudience() throws Exception {
        String token = token(
                properties.getSecret(),
                "local-user-1",
                properties.getIssuer(),
                List.of("other-service"),
                Instant.now().plusSeconds(300),
                null);

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsMissingSubject() throws Exception {
        String token = token(
                properties.getSecret(),
                null,
                properties.getIssuer(),
                List.of(properties.getAudience()),
                Instant.now().plusSeconds(300),
                null);

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsBlankSubject() throws Exception {
        String token = token(
                properties.getSecret(),
                " ",
                properties.getIssuer(),
                List.of(properties.getAudience()),
                Instant.now().plusSeconds(300),
                null);

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsExpiredToken() throws Exception {
        String token = token(
                properties.getSecret(),
                "local-user-1",
                properties.getIssuer(),
                List.of(properties.getAudience()),
                Instant.now().minusSeconds(120),
                null);

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsTokenBeforeItsUseTime() throws Exception {
        String token = token(
                properties.getSecret(),
                "local-user-1",
                properties.getIssuer(),
                List.of(properties.getAudience()),
                Instant.now().plusSeconds(600),
                Instant.now().plusSeconds(120));

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsInvalidSignature() throws Exception {
        String token = token(
                "different-local-signing-key-that-is-long-enough",
                "local-user-1",
                properties.getIssuer(),
                List.of(properties.getAudience()),
                Instant.now().plusSeconds(300),
                null);

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    private String token(
            String secret,
            String subject,
            String issuer,
            List<String> audience,
            Instant expiresAt,
            Instant notBefore
    ) throws Exception {
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .audience(audience)
                .issueTime(Date.from(now.minusSeconds(5)))
                .expirationTime(Date.from(expiresAt));
        if (subject != null) {
            claims.subject(subject);
        }
        if (notBefore != null) {
            claims.notBeforeTime(Date.from(notBefore));
        }

        SignedJWT jwt = new SignedJWT(
                new JWSHeader(JWSAlgorithm.HS256),
                claims.build());
        jwt.sign(new MACSigner(secret.getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }
}
