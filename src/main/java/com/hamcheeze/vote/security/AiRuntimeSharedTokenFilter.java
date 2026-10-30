package com.hamcheeze.vote.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

final class AiRuntimeSharedTokenFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final boolean configured;
    private final byte[] expectedTokenDigest;
    private final VoteApiSecurityProblemWriter problemWriter;

    AiRuntimeSharedTokenFilter(
            String expectedToken,
            VoteApiSecurityProblemWriter problemWriter
    ) {
        this.configured = expectedToken != null
                && !expectedToken.isBlank();
        this.expectedTokenDigest = digest(
                configured ? expectedToken.strip() : "");
        this.problemWriter = Objects.requireNonNull(
                problemWriter, "problemWriter");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (!validToken(request)) {
            problemWriter.commence(
                    request,
                    response,
                    new BadCredentialsException(
                            "AI Runtime shared token is invalid"));
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean validToken(HttpServletRequest request) {
        if (!configured) {
            return false;
        }
        List<String> headers = Collections.list(
                request.getHeaders(HttpHeaders.AUTHORIZATION));
        if (headers.size() != 1) {
            return false;
        }
        String header = headers.get(0);
        if (!header.regionMatches(
                true,
                0,
                BEARER_PREFIX,
                0,
                BEARER_PREFIX.length())) {
            return false;
        }
        String presentedToken = header.substring(BEARER_PREFIX.length());
        return !presentedToken.isBlank()
                && MessageDigest.isEqual(
                        expectedTokenDigest,
                        digest(presentedToken));
    }

    private static byte[] digest(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(
                    value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 is unavailable", exception);
        }
    }
}
