package com.hamcheeze.chat.message.search;

import java.util.Objects;
import java.util.regex.Pattern;

public record ChatMessageSearchCriteria(
        String normalizedQuery,
        String normalizedQueryFingerprint,
        int resultLimit
) {

    private static final Pattern SHA_256_HEX =
            Pattern.compile("^[0-9a-f]{64}$");

    public ChatMessageSearchCriteria {
        if (normalizedQuery == null || normalizedQuery.isBlank()) {
            throw new IllegalArgumentException(
                    "normalizedQuery must not be blank");
        }
        int queryCodePoints = normalizedQuery.codePointCount(
                0,
                normalizedQuery.length());
        if (queryCodePoints
                < ChatMessageSearchNormalizer.MIN_QUERY_CODE_POINTS
                || queryCodePoints
                > ChatMessageSearchNormalizer.MAX_QUERY_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "normalizedQuery has an invalid length");
        }
        if (normalizedQueryFingerprint == null
                || !SHA_256_HEX.matcher(
                        normalizedQueryFingerprint).matches()) {
            throw new IllegalArgumentException(
                    "normalizedQueryFingerprint must be SHA-256 hex");
        }
        if (resultLimit < 1 || resultLimit > 50) {
            throw new IllegalArgumentException(
                    "resultLimit must be between 1 and 50");
        }
    }

    public static ChatMessageSearchCriteria resolve(
            String query,
            Integer limit,
            ChatMessageSearchNormalizer normalizer,
            ChatMessageSearchProperties properties
    ) {
        Objects.requireNonNull(normalizer, "normalizer");
        Objects.requireNonNull(properties, "properties");
        String normalized = normalizer.normalizeQuery(query);
        int resolvedLimit = limit == null
                ? properties.getDefaultResultLimit()
                : limit;
        if (resolvedLimit < 1
                || resolvedLimit > properties.getMaxResultLimit()) {
            throw new IllegalArgumentException(
                    "message search limit must be between 1 and "
                            + properties.getMaxResultLimit());
        }
        return new ChatMessageSearchCriteria(
                normalized,
                normalizer.fingerprint(normalized),
                resolvedLimit);
    }
}
