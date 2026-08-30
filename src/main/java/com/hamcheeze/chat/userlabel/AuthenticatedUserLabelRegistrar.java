package com.hamcheeze.chat.userlabel;

import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public final class AuthenticatedUserLabelRegistrar {

    private final UserLabelDirectory directory;
    private final ConcurrentMap<String, String> registeredLabels =
            new ConcurrentHashMap<>();

    public AuthenticatedUserLabelRegistrar(
            UserLabelDirectory directory
    ) {
        this.directory = Objects.requireNonNull(
                directory,
                "directory");
    }

    public void register(JwtAuthenticationToken authentication) {
        if (authentication == null) {
            return;
        }
        String userId = authentication.getToken().getSubject();
        if (userId == null || userId.isBlank()) {
            return;
        }
        UserLabel.from(authentication.getToken())
                .ifPresent(userLabel -> register(
                        userId,
                        userLabel));
    }

    private void register(String userId, String userLabel) {
        if (userLabel.equals(registeredLabels.get(userId))) {
            return;
        }
        directory.upsert(userId, userLabel);
        registeredLabels.put(userId, userLabel);
    }

    public static AuthenticatedUserLabelRegistrar noop() {
        return new AuthenticatedUserLabelRegistrar(
                UserLabelDirectory.noop());
    }
}
