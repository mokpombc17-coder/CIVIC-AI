package com.hamcheeze.chat.room;

import java.net.URI;
import java.time.Instant;

public record MembershipProfile(
        long participantNumber,
        String displayName,
        String imageUrl,
        long version,
        Instant createdAt,
        Instant updatedAt
) {

    public static final int MAX_DISPLAY_NAME_CODE_POINTS = 50;
    public static final int MAX_IMAGE_URL_LENGTH = 2_048;

    private static final String ANONYMOUS_DISPLAY_NAME_PREFIX = "참여자 ";

    public MembershipProfile {
        requirePositive(participantNumber);
        displayName = requireDisplayName(displayName);
        imageUrl = requireImageUrl(imageUrl);
        requirePositive(version);
        if (createdAt == null
                || updatedAt == null
                || updatedAt.isBefore(createdAt)) {
            throw invalidProfile();
        }
    }

    public static MembershipProfile createAnonymous(
            long participantNumber,
            Instant createdAt
    ) {
        return new MembershipProfile(
                participantNumber,
                ANONYMOUS_DISPLAY_NAME_PREFIX + participantNumber,
                null,
                1,
                createdAt,
                createdAt);
    }

    public static MembershipProfile restore(
            long participantNumber,
            String displayName,
            String imageUrl,
            long version,
            Instant createdAt,
            Instant updatedAt
    ) {
        return new MembershipProfile(
                participantNumber,
                displayName,
                imageUrl,
                version,
                createdAt,
                updatedAt);
    }

    private static String requireDisplayName(String displayName) {
        if (displayName == null
                || containsIsoControlCharacter(displayName)) {
            throw invalidProfile();
        }
        String canonical = displayName.strip();
        if (canonical.isEmpty()
                || canonical.codePointCount(0, canonical.length())
                > MAX_DISPLAY_NAME_CODE_POINTS) {
            throw invalidProfile();
        }
        return canonical;
    }

    private static String requireImageUrl(String imageUrl) {
        if (imageUrl == null) {
            return null;
        }
        if (containsIsoControlCharacter(imageUrl)) {
            throw invalidProfile();
        }
        String canonical = imageUrl.strip();
        if (canonical.isEmpty()
                || canonical.length() > MAX_IMAGE_URL_LENGTH) {
            throw invalidProfile();
        }
        URI uri;
        try {
            uri = URI.create(canonical);
        } catch (IllegalArgumentException exception) {
            throw invalidProfile();
        }
        if (!("http".equalsIgnoreCase(uri.getScheme())
                || "https".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null) {
            throw invalidProfile();
        }
        return canonical;
    }

    private static boolean containsIsoControlCharacter(String value) {
        return value.codePoints().anyMatch(Character::isISOControl);
    }

    private static void requirePositive(long value) {
        if (value < 1) {
            throw invalidProfile();
        }
    }

    private static RoomDomainException invalidProfile() {
        return new RoomDomainException(
                RoomDomainErrorCode.INVALID_MEMBERSHIP_PROFILE);
    }
}
