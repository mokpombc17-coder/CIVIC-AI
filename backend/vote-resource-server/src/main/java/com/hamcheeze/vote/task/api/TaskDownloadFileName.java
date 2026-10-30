package com.hamcheeze.vote.task.api;

import org.springframework.http.ContentDisposition;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

final class TaskDownloadFileName {

    private static final int MAX_TITLE_UTF8_BYTES = 180;
    private static final Pattern UNSAFE_CHARACTERS = Pattern.compile(
            "[\\x00-\\x1f\\x7f\\\\/:*?\"<>|]");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern UNDERSCORE_PADDING = Pattern.compile(
            "\\s*_+\\s*");
    private static final Pattern UNSAFE_TRAILING_CHARACTERS = Pattern.compile(
            "[._ ]+$");

    private TaskDownloadFileName() {
    }

    static ContentDisposition resultAttachment(
            String taskTitle,
            UUID taskId,
            String extension
    ) {
        return ContentDisposition.attachment()
                .filename(result(taskTitle, taskId, extension),
                        StandardCharsets.UTF_8)
                .build();
    }

    static String result(
            String taskTitle,
            UUID taskId,
            String extension
    ) {
        Objects.requireNonNull(taskTitle, "taskTitle");
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(extension, "extension");
        if (!extension.matches("[a-z0-9]+")) {
            throw new IllegalArgumentException(
                    "extension must contain lowercase letters and digits only");
        }

        String normalized = Normalizer.normalize(
                taskTitle, Normalizer.Form.NFC);
        String sanitized = UNSAFE_CHARACTERS.matcher(normalized)
                .replaceAll("_");
        sanitized = WHITESPACE.matcher(sanitized).replaceAll(" ").trim();
        sanitized = UNDERSCORE_PADDING.matcher(sanitized)
                .replaceAll("_");
        sanitized = UNSAFE_TRAILING_CHARACTERS.matcher(sanitized)
                .replaceAll("");
        sanitized = truncateUtf8(sanitized, MAX_TITLE_UTF8_BYTES);
        sanitized = UNSAFE_TRAILING_CHARACTERS.matcher(sanitized)
                .replaceAll("");
        if (sanitized.isBlank()) {
            sanitized = "task-" + taskId;
        }
        return sanitized + "_결과." + extension;
    }

    private static String truncateUtf8(String value, int maxBytes) {
        int endIndex = 0;
        int byteCount = 0;
        while (endIndex < value.length()) {
            int codePoint = value.codePointAt(endIndex);
            int codePointLength = Character.charCount(codePoint);
            int codePointBytes = new String(Character.toChars(codePoint))
                    .getBytes(StandardCharsets.UTF_8).length;
            if (byteCount + codePointBytes > maxBytes) {
                break;
            }
            byteCount += codePointBytes;
            endIndex += codePointLength;
        }
        return value.substring(0, endIndex).stripTrailing();
    }
}
