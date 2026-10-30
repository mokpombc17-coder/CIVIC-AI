package com.hamcheeze.civic.auth;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import java.math.BigInteger;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

public final class CivicAccessTokenValidator
        implements OAuth2TokenValidator<Jwt> {

    private static final OAuth2Error INVALID_TOKEN = new OAuth2Error(
            "invalid_token",
            "Invalid CIVIC access token",
            null);

    private final String issuer;
    private final Clock clock;

    public CivicAccessTokenValidator(String issuer) {
        this(issuer, Clock.systemUTC());
    }

    CivicAccessTokenValidator(String issuer, Clock clock) {
        this.issuer = issuer;
        this.clock = clock;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        try {
            validateHeader(jwt);
            validateIssuerAndAudience(jwt);
            validateTimes(jwt);
            canonicalUuid(jwt.getSubject());
            canonicalUuid(jwt.getId());
            validateEmail(jwt.getClaim("email"));
            validateAccountStateVersion(
                    jwt.getClaim("account_state_version"));
            validateBoolean(jwt.getClaim("must_change_password"));
            validateScope(jwt.getClaim("scope"));
            return OAuth2TokenValidatorResult.success();
        } catch (IllegalArgumentException exception) {
            return OAuth2TokenValidatorResult.failure(INVALID_TOKEN);
        }
    }

    private static void validateHeader(Jwt jwt) {
        if (!CivicAuthContract.ALGORITHM.equals(
                jwt.getHeaders().get("alg"))
                || !CivicAuthContract.TOKEN_TYPE.equals(
                jwt.getHeaders().get("typ"))) {
            throw invalid();
        }
        Object kid = jwt.getHeaders().get("kid");
        if (!(kid instanceof String value) || value.isBlank()) {
            throw invalid();
        }
    }

    private void validateIssuerAndAudience(Jwt jwt) {
        if (!issuer.equals(jwt.getClaimAsString("iss"))) {
            throw invalid();
        }
        List<String> audience = jwt.getAudience();
        if (!List.of(CivicAuthContract.AUDIENCE).equals(audience)) {
            throw invalid();
        }
    }

    private void validateTimes(Jwt jwt) {
        Instant issuedAt = jwt.getIssuedAt();
        Instant expiresAt = jwt.getExpiresAt();
        Instant now = clock.instant();
        if (issuedAt == null
                || expiresAt == null
                || !expiresAt.isAfter(now)
                || issuedAt.isAfter(now.plus(
                CivicAuthContract.FUTURE_IAT_TOLERANCE))
                || !Duration.between(issuedAt, expiresAt).equals(
                CivicAuthContract.ACCESS_TOKEN_LIFETIME)) {
            throw invalid();
        }
    }

    private static void canonicalUuid(Object value) {
        if (!(value instanceof String text) || text.isBlank()) {
            throw invalid();
        }
        try {
            if (!UUID.fromString(text).toString().equals(text)) {
                throw invalid();
            }
        } catch (IllegalArgumentException exception) {
            throw invalid();
        }
    }

    private static void validateEmail(Object value) {
        if (!(value instanceof String email)
                || email.length() > 320
                || !email.equals(email.strip().toLowerCase(Locale.ROOT))
                || !CivicAuthContract.EMAIL.matcher(email).matches()) {
            throw invalid();
        }
    }

    private static void validateAccountStateVersion(Object value) {
        if (value instanceof BigInteger integer) {
            if (integer.signum() < 0) {
                throw invalid();
            }
            return;
        }
        if (!(value instanceof Byte
                || value instanceof Short
                || value instanceof Integer
                || value instanceof Long)
                || ((Number) value).longValue() < 0) {
            throw invalid();
        }
    }

    private static void validateBoolean(Object value) {
        if (!(value instanceof Boolean)) {
            throw invalid();
        }
    }

    private static void validateScope(Object value) {
        if (!(value instanceof String rawScope) || rawScope.isBlank()) {
            throw invalid();
        }
        String[] items = rawScope.split(" ", -1);
        Set<String> unique = new HashSet<>();
        for (String item : items) {
            if (item.isEmpty()
                    || item.codePoints().anyMatch(Character::isWhitespace)
                    || !unique.add(item)) {
                throw invalid();
            }
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("invalid access token");
    }
}
