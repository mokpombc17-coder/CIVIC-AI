package com.hamcheeze.vote.security;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

public final class AuthenticatedUserIdResolver {

    public String resolve(Authentication authentication) {
        JwtAuthenticationToken jwtAuthentication = jwt(authentication);
        String subject = jwtAuthentication.getToken().getSubject();
        if (subject == null || subject.isBlank()) {
            throw unauthenticated();
        }
        return subject;
    }

    private static JwtAuthenticationToken jwt(
            Authentication authentication
    ) {
        if (!(authentication
                instanceof JwtAuthenticationToken jwtAuthentication)) {
            throw unauthenticated();
        }
        return jwtAuthentication;
    }

    private static BadCredentialsException unauthenticated() {
        return new BadCredentialsException(
                "A valid JWT subject is required");
    }
}
