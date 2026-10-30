package com.hamcheeze.vote.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuthenticatedUserIdResolverTest {

    private final AuthenticatedUserIdResolver resolver =
            new AuthenticatedUserIdResolver();

    @Test
    void returnsJwtSubject() {
        JwtAuthenticationToken authentication =
                new JwtAuthenticationToken(jwt("user-a"));

        assertThat(resolver.resolve(authentication)).isEqualTo("user-a");
    }

    @Test
    void rejectsNonJwtAuthentication() {
        UsernamePasswordAuthenticationToken authentication =
                UsernamePasswordAuthenticationToken.authenticated(
                        "user-a",
                        "credentials",
                        java.util.List.of());

        assertThatThrownBy(() -> resolver.resolve(authentication))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void rejectsMissingSubject() {
        JwtAuthenticationToken authentication =
                new JwtAuthenticationToken(jwt(null));

        assertThatThrownBy(() -> resolver.resolve(authentication))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void rejectsBlankSubject() {
        JwtAuthenticationToken authentication =
                new JwtAuthenticationToken(jwt(" "));

        assertThatThrownBy(() -> resolver.resolve(authentication))
                .isInstanceOf(BadCredentialsException.class);
    }

    private Jwt jwt(String subject) {
        Instant now = Instant.now();
        Jwt.Builder builder = Jwt.withTokenValue("token")
                .header("alg", "none")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(300));
        if (subject != null) {
            builder.subject(subject);
        }
        return builder.build();
    }
}
