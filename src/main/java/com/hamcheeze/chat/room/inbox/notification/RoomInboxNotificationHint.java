package com.hamcheeze.chat.room.inbox.notification;

import java.time.Instant;

public record RoomInboxNotificationHint(
        String messageId,
        long messageVersion,
        String senderUserId,
        String senderMembershipId,
        Instant messageCreatedAt,
        String preview,
        boolean previewTruncated
) {

    public RoomInboxNotificationHint {
        requireText(messageId, "messageId");
        if (messageVersion < 1) {
            throw new IllegalArgumentException(
                    "messageVersion must be at least 1");
        }
        requireText(senderUserId, "senderUserId");
        requireText(senderMembershipId, "senderMembershipId");
        if (messageCreatedAt == null) {
            throw new IllegalArgumentException(
                    "messageCreatedAt must not be null");
        }
        if (preview == null || preview.isBlank()
                || preview.codePointCount(0, preview.length())
                > NotificationPreview.MAX_CODE_POINTS
                || preview.indexOf('\r') >= 0
                || preview.indexOf('\n') >= 0
                || preview.indexOf('\t') >= 0) {
            throw new IllegalArgumentException("Invalid preview");
        }
    }

    private static void requireText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
    }
}
