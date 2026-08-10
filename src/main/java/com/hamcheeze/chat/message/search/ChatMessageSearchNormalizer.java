package com.hamcheeze.chat.message.search;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.Locale;

public final class ChatMessageSearchNormalizer {

    public static final int MIN_QUERY_CODE_POINTS = 2;
    public static final int MAX_QUERY_CODE_POINTS = 100;

    public String normalizeQuery(String query) {
        if (query == null) {
            throw new IllegalArgumentException(
                    "message search query must not be null");
        }
        if (query.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(
                    "message search query must not contain control "
                            + "characters");
        }

        String normalized = normalizeText(query);
        int codePoints = normalized.codePointCount(
                0,
                normalized.length());
        if (codePoints < MIN_QUERY_CODE_POINTS
                || codePoints > MAX_QUERY_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "message search query must contain between 2 and "
                            + "100 code points");
        }
        return normalized;
    }

    public String normalizeContent(String content) {
        if (content == null) {
            throw new IllegalArgumentException(
                    "message search content must not be null");
        }
        return normalizeText(content);
    }

    public String fingerprint(String normalizedQuery) {
        if (normalizedQuery == null || normalizedQuery.isBlank()) {
            throw new IllegalArgumentException(
                    "normalizedQuery must not be blank");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(
                    normalizedQuery.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 is not available",
                    exception);
        }
    }

    private String normalizeText(String value) {
        StringBuilder collapsed = new StringBuilder(value.length());
        boolean pendingSpace = false;
        int[] codePoints = value.codePoints().toArray();
        for (int codePoint : codePoints) {
            if (isSearchWhitespace(codePoint)) {
                pendingSpace = collapsed.length() > 0;
                continue;
            }
            if (pendingSpace) {
                collapsed.append(' ');
                pendingSpace = false;
            }
            collapsed.appendCodePoint(codePoint);
        }

        String canonical = Normalizer.normalize(
                collapsed,
                Normalizer.Form.NFC);
        canonical = canonical.toLowerCase(Locale.ROOT);
        return Normalizer.normalize(canonical, Normalizer.Form.NFC);
    }

    private boolean isSearchWhitespace(int codePoint) {
        return Character.isWhitespace(codePoint)
                || Character.isSpaceChar(codePoint);
    }
}
