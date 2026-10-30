package com.hamcheeze.civic.auth;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSObject;
import com.nimbusds.jose.Payload;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.util.JSONObjectUtils;
import com.nimbusds.jwt.JWTClaimsSet;

import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

final class TestTokenFactory {

    private TestTokenFactory() {
    }

    static RSAKey rsaKey(String kid) throws Exception {
        return new RSAKeyGenerator(2_048)
                .keyID(kid)
                .algorithm(JWSAlgorithm.RS256)
                .keyUse(com.nimbusds.jose.jwk.KeyUse.SIGNATURE)
                .generate();
    }

    static String jwks(RSAKey... keys) {
        return new JWKSet(List.of(keys).stream()
                .map(RSAKey::toPublicJWK)
                .map(key -> (com.nimbusds.jose.jwk.JWK) key)
                .toList())
                .toString();
    }

    static String token(
            RSAKey key,
            Instant issuedAt,
            Consumer<JWTClaimsSet.Builder> claimsCustomizer
    ) throws Exception {
        JWTClaimsSet.Builder claims = validClaims(issuedAt);
        claimsCustomizer.accept(claims);
        return token(key, claims.build(), JOSEObjectType.JWT, key.getKeyID());
    }

    static String token(
            RSAKey key,
            JWTClaimsSet claims,
            JOSEObjectType type,
            String kid
    ) throws Exception {
        return token(key, claims, type, kid, claims.getAudience());
    }

    static String tokenWithRawAudience(
            RSAKey key,
            Instant issuedAt,
            Object audience
    ) throws Exception {
        JWTClaimsSet claims = validClaims(issuedAt).build();
        return token(
                key,
                claims,
                JOSEObjectType.JWT,
                key.getKeyID(),
                audience);
    }

    private static String token(
            RSAKey key,
            JWTClaimsSet claims,
            JOSEObjectType type,
            String kid,
            Object rawAudience
    ) throws Exception {
        JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                .type(type)
                .keyID(kid)
                .build();
        java.util.Map<String, Object> claimJson = claims.toJSONObject();
        claimJson.put("aud", rawAudience);
        JWSObject jwt = new JWSObject(
                header,
                new Payload(JSONObjectUtils.toJSONString(claimJson)));
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }

    static JWTClaimsSet.Builder validClaims(Instant issuedAt) {
        return new JWTClaimsSet.Builder()
                .issuer("https://issuer.example")
                .subject("00000000-0000-0000-0000-000000000001")
                .claim("email", "user@example.com")
                .audience(List.of(CivicAuthContract.AUDIENCE))
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(issuedAt.plusSeconds(900)))
                .jwtID(UUID.randomUUID().toString())
                .claim("scope", "chat:connect vote:surveys:read")
                .claim("account_state_version", 0)
                .claim("must_change_password", false);
    }
}
