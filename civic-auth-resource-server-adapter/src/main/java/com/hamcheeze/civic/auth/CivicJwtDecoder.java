package com.hamcheeze.civic.auth;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import java.time.Clock;
import java.util.Objects;

public final class CivicJwtDecoder implements JwtDecoder {

    private final CompactJwtContractValidator compactTokenValidator;
    private final JwtDecoder delegate;
    private final Clock clock;

    CivicJwtDecoder(
            CompactJwtContractValidator compactTokenValidator,
            JwtDecoder delegate,
            Clock clock
    ) {
        this.compactTokenValidator = Objects.requireNonNull(
                compactTokenValidator,
                "compactTokenValidator");
        this.delegate = Objects.requireNonNull(delegate, "delegate");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Override
    public Jwt decode(String token) {
        compactTokenValidator.validateHeader(token);
        Jwt jwt = delegate.decode(token);
        compactTokenValidator.validateSignedClaims(token, clock);
        return jwt;
    }
}
