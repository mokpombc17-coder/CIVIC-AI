package com.hamcheeze.chat.message.mongo;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;

final class ChatMessageContentFingerprint {

    private ChatMessageContentFingerprint() {
    }

    static String of(String content) {
        Objects.requireNonNull(content, "content");
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(content.getBytes(
                                    StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 is not available",
                    exception);
        }
    }
}
