package com.hamcheeze.chat.room.inbox.notification;

import java.time.Instant;

public record RoomInboxNotificationHint(
        String messageId,
        long messageVersion,
        String senderUserId,
        Instant messageCreatedAt,
        String preview,
        boolean previewTruncated
) {
}
