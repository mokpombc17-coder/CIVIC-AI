package com.hamcheeze.chat.room.inbox.notification;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxEvent;
import com.hamcheeze.chat.message.outbox.ClaimedChatMessageOutboxEvent;

import java.util.Objects;

public record RoomInboxNotificationIntent(
        String sourceOutboxEventId,
        String eventType,
        ChatMessagePayload message
) {

    public RoomInboxNotificationIntent {
        if (sourceOutboxEventId == null
                || sourceOutboxEventId.isBlank()) {
            throw new IllegalArgumentException(
                    "sourceOutboxEventId must not be blank");
        }
        if (!ChatMessageOutboxEvent.MESSAGE_CREATED.equals(eventType)
                && !ChatMessageOutboxEvent.MESSAGE_UPDATED
                .equals(eventType)
                && !ChatMessageOutboxEvent.MESSAGE_DELETED
                .equals(eventType)) {
            throw new IllegalArgumentException(
                    "Notification intent only supports "
                            + "CREATE/UPDATE/DELETE");
        }
        Objects.requireNonNull(message, "message");
    }

    public static RoomInboxNotificationIntent from(
            ClaimedChatMessageOutboxEvent claimed,
            ChatMessageEventEnvelope envelope
    ) {
        return new RoomInboxNotificationIntent(
                claimed.eventId(),
                envelope.eventType(),
                envelope.payload());
    }

    public String roomId() {
        return message.roomId();
    }

    public String messageId() {
        return message.messageId();
    }
}
