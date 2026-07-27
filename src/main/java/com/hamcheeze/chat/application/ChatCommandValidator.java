package com.hamcheeze.chat.application;

import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

@Component
public final class ChatCommandValidator {

    private final int maximumCodePoints;
    private final int maximumUtf8Bytes;
    private final Set<Integer> allowedC0CodePoints;

    public ChatCommandValidator(ChatContentProperties properties) {
        this.maximumCodePoints = properties.getMaxContentCodePoints();
        this.maximumUtf8Bytes = properties.getMaxContentUtf8Bytes();
        this.allowedC0CodePoints =
                properties.getRejectC0ControlCharactersExcept().stream()
                        .map(ChatCommandValidator::controlCodePoint)
                        .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    public String validateClientMessageId(String clientMessageId) {
        if (clientMessageId == null) {
            throw new ChatValidationException(
                    ChatCommandRejectedCode.INVALID_CLIENT_MESSAGE_ID, null);
        }
        try {
            String canonical = UUID.fromString(clientMessageId).toString();
            if (!canonical.equalsIgnoreCase(clientMessageId)) {
                throw invalidClientMessageId();
            }
            return canonical;
        } catch (IllegalArgumentException exception) {
            throw invalidClientMessageId();
        }
    }

    public ValidatedChatContent validateContent(
            String rawContent,
            String clientMessageId
    ) {
        if (rawContent == null) {
            throw new ChatValidationException(
                    ChatCommandRejectedCode.EMPTY_MESSAGE, clientMessageId);
        }
        if (containsForbiddenC0(rawContent)) {
            throw new ChatValidationException(
                    ChatCommandRejectedCode.INVALID_CONTROL_CHARACTER,
                    clientMessageId);
        }

        String normalizedContent = rawContent.strip();
        if (normalizedContent.isBlank()) {
            throw new ChatValidationException(
                    ChatCommandRejectedCode.EMPTY_MESSAGE, clientMessageId);
        }

        int codePointCount = normalizedContent.codePointCount(
                0, normalizedContent.length());
        if (codePointCount > maximumCodePoints) {
            throw new ChatValidationException(
                    ChatCommandRejectedCode.MESSAGE_TOO_LONG, clientMessageId);
        }

        int utf8ByteCount =
                normalizedContent.getBytes(StandardCharsets.UTF_8).length;
        if (utf8ByteCount > maximumUtf8Bytes) {
            throw new ChatValidationException(
                    ChatCommandRejectedCode.MESSAGE_TOO_LARGE, clientMessageId);
        }
        return new ValidatedChatContent(
                normalizedContent, codePointCount, utf8ByteCount);
    }

    private boolean containsForbiddenC0(String content) {
        return content.codePoints().anyMatch(codePoint ->
                codePoint >= 0
                        && codePoint <= 0x1F
                        && !allowedC0CodePoints.contains(codePoint));
    }

    private static int controlCodePoint(String name) {
        return switch (name) {
            case "TAB" -> '\t';
            case "LF" -> '\n';
            case "CR" -> '\r';
            default -> throw new IllegalArgumentException(
                    "Unsupported C0 exception: " + name);
        };
    }

    private static ChatValidationException invalidClientMessageId() {
        return new ChatValidationException(
                ChatCommandRejectedCode.INVALID_CLIENT_MESSAGE_ID, null);
    }
}
