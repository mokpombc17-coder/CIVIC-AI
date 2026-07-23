package com.hamcheeze.chat.application;

public record ValidatedChatContent(
        String normalizedContent,
        int codePointCount,
        int utf8ByteCount
) {
}
