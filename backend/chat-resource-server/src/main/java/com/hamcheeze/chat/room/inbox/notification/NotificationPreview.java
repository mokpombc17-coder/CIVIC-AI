package com.hamcheeze.chat.room.inbox.notification;

public record NotificationPreview(
        String value,
        boolean truncated
) {

    public static final int MAX_CODE_POINTS = 30;

    public static NotificationPreview from(String content) {
        if (content == null) {
            throw new IllegalArgumentException(
                    "content must not be null");
        }
        int lineEnd = firstLineBreak(content);
        boolean truncated = lineEnd < content.length();
        String firstLine = content.substring(0, lineEnd)
                .replace('\t', ' ')
                .strip();
        int codePoints = firstLine.codePointCount(
                0, firstLine.length());
        if (codePoints > MAX_CODE_POINTS) {
            int end = firstLine.offsetByCodePoints(
                    0, MAX_CODE_POINTS);
            firstLine = firstLine.substring(0, end);
            truncated = true;
        }
        return new NotificationPreview(firstLine, truncated);
    }

    private static int firstLineBreak(String value) {
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (current == '\r' || current == '\n') {
                return index;
            }
        }
        return value.length();
    }
}
