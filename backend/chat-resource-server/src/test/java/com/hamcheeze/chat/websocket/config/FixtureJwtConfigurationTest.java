package com.hamcheeze.chat.websocket.config;

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
    void usesFrontendEmulatorContractDefaults() {
        assertThat(properties.getSecret()).isEqualTo(
                "civic-ai-local-auth-fixture-signing-key-v1-"
                        + "public-do-not-use-in-production");
        assertThat(properties.getIssuer()).isEqualTo(
                "http://localhost:3000/api/dev/auth");
        assertThat(properties.getAudience()).isEqualTo("civic-ai-api");
    }

    @Test
    void acceptsFixtureTokenWithExpectedIssuerAndAudience()
            throws Exception {
        String token = token(
                "local-user-1",
                properties.getIssuer(),
                List.of(properties.getAudience()));

        assertThat(decoder.decode(token).getSubject())
                .isEqualTo("local-user-1");
    }

    @Test
    void rejectsUnexpectedAudience() throws Exception {
        String token = token(
                "local-user-1",
                properties.getIssuer(),
                List.of("other-service"));

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsUnexpectedIssuer() throws Exception {
        String token = token(
                "local-user-1",
                "other-issuer",
                List.of(properties.getAudience()));

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsBlankSubject() throws Exception {
        String token = token(
                " ",
                properties.getIssuer(),
                List.of(properties.getAudience()));

        assertThatThrownBy(() -> decoder.decode(token))
                .isInstanceOf(RuntimeException.class);
    }

    private String token(
            String subject,
            String issuer,
            List<String> audience
    ) throws Exception {
        Instant now = Instant.now();
        SignedJWT jwt = new SignedJWT(
                new JWSHeader(JWSAlgorithm.HS256),
                new JWTClaimsSet.Builder()
                        .subject(subject)
                        .issuer(issuer)
                        .audience(audience)
                        .issueTime(Date.from(now.minusSeconds(1)))
                        .expirationTime(Date.from(
                                now.plusSeconds(3_600)))
                        .build());
        jwt.sign(new MACSigner(properties.getSecret()
                .getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }
}
