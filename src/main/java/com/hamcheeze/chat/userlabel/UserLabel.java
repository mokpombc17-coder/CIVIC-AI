package com.hamcheeze.chat.userlabel;

import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Optional;
import java.util.UUID;

public final class UserLabel {

    private UserLabel() {
    }

    public static Optional<String> from(Jwt jwt) {
        if (jwt == null) {
            return Optional.empty();
        }
        Optional<String> emailLabel = fromEmail(
                jwt.getClaimAsString("email"));
        if (emailLabel.isPresent()) {
            return emailLabel;
        }
        return fromLegacyUserId(jwt.getSubject());
    }

    public static String fallback(
            String userId,
            String displayName
    ) {
        return fromLegacyUserId(userId)
                .orElse(displayName);
    }

    private static Optional<String> fromEmail(String email) {
        if (email == null || email.isBlank()) {
            return Optional.empty();
        }
        int separatorIndex = email.indexOf('@');
        if (separatorIndex < 1) {
            return Optional.empty();
        }
        return Optional.of(email.substring(0, separatorIndex));
    }

    private static Optional<String> fromLegacyUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return Optional.empty();
        }
        Optional<String> emailLabel = fromEmail(userId);
        if (emailLabel.isPresent()) {
            return emailLabel;
        }
        return isCanonicalUuid(userId)
                ? Optional.empty()
                : Optional.of(userId);
    }

    private static boolean isCanonicalUuid(String value) {
        try {
            return UUID.fromString(value).toString().equals(value);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
