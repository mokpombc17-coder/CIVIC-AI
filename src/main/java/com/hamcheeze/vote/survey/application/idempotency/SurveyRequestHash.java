package com.hamcheeze.vote.survey.application.idempotency;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;

public final class SurveyRequestHash {

    public static final int SHA_256_LENGTH = 32;

    private final byte[] value;

    public SurveyRequestHash(byte[] value) {
        if (value == null || value.length != SHA_256_LENGTH) {
            throw new IllegalArgumentException(
                    "request hash must be a 32-byte SHA-256 value");
        }
        this.value = Arrays.copyOf(value, value.length);
    }

    public static SurveyRequestHash sha256(byte[] canonicalRequest) {
        if (canonicalRequest == null) {
            throw new IllegalArgumentException(
                    "canonicalRequest must not be null");
        }
        try {
            return new SurveyRequestHash(
                    MessageDigest.getInstance("SHA-256")
                            .digest(canonicalRequest));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 must be available", exception);
        }
    }

    public byte[] value() {
        return Arrays.copyOf(value, value.length);
    }

    @Override
    public boolean equals(Object other) {
        return this == other
                || other instanceof SurveyRequestHash that
                && MessageDigest.isEqual(value, that.value);
    }

    @Override
    public int hashCode() {
        return Arrays.hashCode(value);
    }
}
