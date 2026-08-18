package com.hamcheeze.vote.task.application.idempotency;

import java.security.MessageDigest;
import java.util.Arrays;

public final class TaskRequestHash {

    public static final int SHA_256_LENGTH = 32;

    private final byte[] value;

    public TaskRequestHash(byte[] value) {
        if (value == null || value.length != SHA_256_LENGTH) {
            throw new IllegalArgumentException(
                    "request hash must be a 32-byte SHA-256 value");
        }
        this.value = Arrays.copyOf(value, value.length);
    }

    public byte[] value() {
        return Arrays.copyOf(value, value.length);
    }

    @Override
    public boolean equals(Object other) {
        return this == other
                || other instanceof TaskRequestHash that
                && MessageDigest.isEqual(value, that.value);
    }

    @Override
    public int hashCode() {
        return Arrays.hashCode(value);
    }
}
