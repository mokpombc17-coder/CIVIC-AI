package com.hamcheeze.chat.room.category;

import java.text.Normalizer;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;

public record RoomCategory(
        String categoryId,
        String name,
        String normalizedName,
        Instant createdAt,
        Instant updatedAt,
        long version
) {

    public static final int MAX_NAME_CODE_POINTS = 50;

    public RoomCategory {
        categoryId = requireNonBlank(categoryId, "categoryId");
        name = canonicalName(name);
        normalizedName = requireNonBlank(
                normalizedName,
                "normalizedName");
        if (!normalizedName.equals(normalizeName(name))) {
            throw new IllegalArgumentException(
                    "normalizedName must match name");
        }
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (updatedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException(
                    "updatedAt must not be before createdAt");
        }
        if (version < 0) {
            throw new IllegalArgumentException(
                    "version must not be negative");
        }
    }

    public static RoomCategory create(
            String categoryId,
            String name,
            Instant createdAt
    ) {
        String canonicalName = canonicalName(name);
        return new RoomCategory(
                categoryId,
                canonicalName,
                normalizeName(canonicalName),
                createdAt,
                createdAt,
                0);
    }

    public RoomCategory rename(String nextName, Instant changedAt) {
        String canonicalName = canonicalName(nextName);
        Instant updateTime = Objects.requireNonNull(
                changedAt,
                "changedAt");
        if (updateTime.isBefore(updatedAt)) {
            throw new IllegalArgumentException(
                    "changedAt must not be before updatedAt");
        }
        if (name.equals(canonicalName)) {
            return this;
        }
        return new RoomCategory(
                categoryId,
                canonicalName,
                normalizeName(canonicalName),
                createdAt,
                updateTime,
                Math.addExact(version, 1));
    }

    public static String canonicalName(String value) {
        String raw = requireNonBlank(value, "name").strip();
        String canonical = Normalizer.normalize(
                raw,
                Normalizer.Form.NFKC);
        if (canonical.codePointCount(0, canonical.length())
                > MAX_NAME_CODE_POINTS) {
            throw new IllegalArgumentException(
                    "name must contain at most "
                            + MAX_NAME_CODE_POINTS
                            + " characters");
        }
        for (int offset = 0; offset < canonical.length();) {
            int codePoint = canonical.codePointAt(offset);
            int type = Character.getType(codePoint);
            if (Character.isISOControl(codePoint)
                    || type == Character.LINE_SEPARATOR
                    || type == Character.PARAGRAPH_SEPARATOR) {
                throw new IllegalArgumentException(
                        "name must be a single line without control characters");
            }
            offset += Character.charCount(codePoint);
        }
        return canonical;
    }

    public static String normalizeName(String value) {
        return canonicalName(value).toLowerCase(Locale.ROOT);
    }

    private static String requireNonBlank(
            String value,
            String fieldName
    ) {
        Objects.requireNonNull(value, fieldName);
        if (value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
        return value;
    }
}
