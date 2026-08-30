package com.hamcheeze.chat.room.api;

import com.hamcheeze.chat.userlabel.AuthenticatedUserLabelRegistrar;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.Objects;

public final class AuthenticatedUserIdResolver {

    private final AuthenticatedUserLabelRegistrar userLabels;

    public AuthenticatedUserIdResolver() {
        this(AuthenticatedUserLabelRegistrar.noop());
    }

    public AuthenticatedUserIdResolver(
            AuthenticatedUserLabelRegistrar userLabels
    ) {
        this.userLabels = Objects.requireNonNull(
                userLabels,
                "userLabels");
    }

    public String resolve(Authentication authentication) {
        if (!(authentication
                instanceof JwtAuthenticationToken jwtAuthentication)) {
            throw unauthenticated();
        }
        String subject = jwtAuthentication.getToken().getSubject();
        if (subject == null || subject.isBlank()) {
            throw unauthenticated();
        }
        userLabels.register(jwtAuthentication);
        return subject;
    }

    private RoomApiInputException unauthenticated() {
        return new RoomApiInputException(
                RoomApiErrorCode.UNAUTHENTICATED,
                HttpStatus.UNAUTHORIZED,
                "A valid JWT subject is required");
    }
}
