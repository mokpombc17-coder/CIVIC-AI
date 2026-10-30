package com.hamcheeze.chat.room.inbox.summary;

public record RoomInboxSummaryPreview(
        String value,
        boolean truncated
) {

    public static final int MAX_CODE_POINTS = 60;

    public RoomInboxSummaryPreview {
        if (value == null
                || value.codePointCount(0, value.length())
                > MAX_CODE_POINTS
                || value.indexOf('\r') >= 0
                || value.indexOf('\n') >= 0
                || value.indexOf('\t') >= 0) {
            throw new IllegalArgumentException("Invalid summary preview");
        }
    }

    public static RoomInboxSummaryPreview from(String content) {
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
        return new RoomInboxSummaryPreview(firstLine, truncated);
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
