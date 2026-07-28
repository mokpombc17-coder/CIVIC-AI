package com.hamcheeze.chat.room.api;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

public final class AuthenticatedUserIdResolver {

    public String resolve(Authentication authentication) {
        if (!(authentication
                instanceof JwtAuthenticationToken jwtAuthentication)) {
            throw unauthenticated();
        }
        String subject = jwtAuthentication.getToken().getSubject();
        if (subject == null || subject.isBlank()) {
            throw unauthenticated();
        }
        return subject;
    }

    private RoomApiInputException unauthenticated() {
        return new RoomApiInputException(
                RoomApiErrorCode.UNAUTHENTICATED,
                HttpStatus.UNAUTHORIZED,
                "A valid JWT subject is required");
    }
}
