package com.hamcheeze.chat.message.outbox.mongo;

import com.hamcheeze.chat.delivery.ChatMessagePayload;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxEvent;
import com.hamcheeze.chat.message.outbox.ClaimedChatMessageOutboxEvent;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;

@Document(collection = MongoChatMessageOutboxDocument.COLLECTION_NAME)
public record MongoChatMessageOutboxDocument(
        @MongoId(FieldType.STRING)
        String eventId,
        int schemaVersion,
        String aggregateType,
        String aggregateId,
        String eventType,
        int eventVersion,
        String roomId,
        Long roomSequence,
        Payload payload,
        Instant occurredAt,
        long attemptCount,
        Instant nextAttemptAt,
        Instant lastAttemptAt,
        String lastFailureType
) {

    public static final String COLLECTION_NAME = "chat_outbox_events";

    public record Payload(
            String messageId,
            String roomId,
            Long roomSequence,
            String senderUserId,
            String clientMessageId,
            String content,
            Instant createdAt
    ) {

        static Payload from(ChatMessagePayload payload) {
            return new Payload(
                    payload.messageId(),
                    payload.roomId(),
                    payload.roomSequence(),
                    payload.senderUserId(),
                    payload.clientMessageId(),
                    payload.content(),
                    payload.createdAt());
        }

        ClaimedChatMessageOutboxEvent.Payload toClaimedPayload() {
            return new ClaimedChatMessageOutboxEvent.Payload(
                    messageId,
                    roomId,
                    roomSequence,
                    senderUserId,
                    clientMessageId,
                    content,
                    createdAt);
        }
    }

    static MongoChatMessageOutboxDocument pending(
            ChatMessageOutboxEvent event
    ) {
        return new MongoChatMessageOutboxDocument(
                event.eventId(),
                event.schemaVersion(),
                event.aggregateType(),
                event.aggregateId(),
                event.eventType(),
                event.eventVersion(),
                event.roomId(),
                event.roomSequence(),
                Payload.from(event.payload()),
                event.occurredAt(),
                0,
                event.occurredAt(),
                null,
                null);
    }

    ClaimedChatMessageOutboxEvent toClaimed() {
        return new ClaimedChatMessageOutboxEvent(
                eventId,
                attemptCount,
                schemaVersion,
                aggregateType,
                aggregateId,
                eventVersion,
                eventType,
                roomId,
                roomSequence,
                payload == null ? null : payload.toClaimedPayload(),
                occurredAt);
    }
}
