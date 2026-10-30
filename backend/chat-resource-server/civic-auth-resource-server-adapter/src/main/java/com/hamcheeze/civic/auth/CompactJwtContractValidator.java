package com.hamcheeze.civic.auth;

import com.nimbusds.jose.util.JSONObjectUtils;
import org.springframework.security.oauth2.jwt.BadJwtException;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

final class CompactJwtContractValidator {

    private static final Pattern BASE64URL =
            Pattern.compile("^[A-Za-z0-9_-]+$");

    private final int maxTokenBytes;
    private final int maxKidLength;

    CompactJwtContractValidator(
            int maxTokenBytes,
            int maxKidLength
    ) {
        this.maxTokenBytes = maxTokenBytes;
        this.maxKidLength = maxKidLength;
    }

    void validateHeader(String token) {
        String[] parts = splitAndValidateCompactForm(token);
        validateHeader(parse(parts[0]));
    }

    void validateSignedClaims(String token, Clock clock) {
        String[] parts = splitAndValidateCompactForm(token);
        validateClaimShapes(parse(parts[1]), clock.instant());
    }

    private String[] splitAndValidateCompactForm(String token) {
        if (token == null
                || token.isBlank()
                || !StandardCharsets.US_ASCII.newEncoder().canEncode(token)
                || token.getBytes(StandardCharsets.US_ASCII).length
                > maxTokenBytes) {
            throw invalid();
        }

        String[] parts = token.split("\\.", -1);
        if (parts.length != 3) {
            throw invalid();
        }
        for (String part : parts) {
            if (!BASE64URL.matcher(part).matches()) {
                throw invalid();
            }
        }
        return parts;
    }

    private void validateHeader(Map<String, Object> header) {
        if (!CivicAuthContract.ALGORITHM.equals(header.get("alg"))
                || !CivicAuthContract.TOKEN_TYPE.equals(header.get("typ"))) {
            throw invalid();
        }
        Object kid = header.get("kid");
        if (!(kid instanceof String value)
                || value.isBlank()
                || value.length() > maxKidLength) {
            throw invalid();
        }
    }

    private static void validateClaimShapes(
            Map<String, Object> claims,
            Instant now
    ) {
        requireString(claims, "iss");
        requireString(claims, "sub");
        requireString(claims, "email");
        BigDecimal issuedAt = requireNumber(claims, "iat");
        BigDecimal expiresAt = requireNumber(claims, "exp");
        requireString(claims, "jti");
        requireString(claims, "scope");

        Object audience = claims.get("aud");
        if (!(audience instanceof List<?> values)
                || values.size() != 1
                || !CivicAuthContract.AUDIENCE.equals(values.getFirst())) {
            throw invalid();
        }

        BigDecimal nowSeconds = BigDecimal.valueOf(now.getEpochSecond())
                .add(BigDecimal.valueOf(now.getNano(), 9));
        if (expiresAt.compareTo(nowSeconds) <= 0
                || issuedAt.compareTo(nowSeconds.add(
                BigDecimal.valueOf(30))) > 0
                || expiresAt.subtract(issuedAt).compareTo(
                BigDecimal.valueOf(900)) != 0) {
            throw invalid();
        }

        Object accountVersion = claims.get("account_state_version");
        if (!isNonNegativeIntegral(accountVersion)) {
            throw invalid();
        }
        if (!(claims.get("must_change_password") instanceof Boolean)) {
            throw invalid();
        }
    }

    private static boolean isNonNegativeIntegral(Object value) {
        if (value instanceof BigInteger integer) {
            return integer.signum() >= 0;
        }
        return (value instanceof Byte
                || value instanceof Short
                || value instanceof Integer
                || value instanceof Long)
                && ((Number) value).longValue() >= 0;
    }

    private static void requireString(
            Map<String, Object> claims,
            String name
    ) {
        if (!(claims.get(name) instanceof String)) {
            throw invalid();
        }
    }

    private static BigDecimal requireNumber(
            Map<String, Object> claims,
            String name
    ) {
        if (!(claims.get(name) instanceof Number number)
                || !Double.isFinite(number.doubleValue())) {
            throw invalid();
        }
        try {
            return new BigDecimal(number.toString());
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private static Map<String, Object> parse(String segment) {
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(segment);
            return JSONObjectUtils.parse(
                    new String(decoded, StandardCharsets.UTF_8),
                    decoded.length);
        } catch (IllegalArgumentException | ParseException exception) {
            throw invalid();
        }
    }

    private static BadJwtException invalid() {
        return new BadJwtException("Invalid CIVIC access token");
    }
}
