package com.hamcheeze.chat.message.audit.mongo;

import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEventType;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.FieldType;
import org.springframework.data.mongodb.core.mapping.MongoId;

import java.time.Instant;

@Document(collection = MongoChatMessageAuditEventDocument.COLLECTION_NAME)
public record MongoChatMessageAuditEventDocument(
        @MongoId(FieldType.STRING)
        String auditEventId,
        int schemaVersion,
        String roomId,
        long roomChangeSequence,
        ChatMessageAuditEventType eventType,
        String messageId,
        long roomSequence,
        long messageVersion,
        String senderMembershipId,
        String senderUserId,
        String actorUserId,
        ChatMessageAuditActorType actorType,
        Instant occurredAt,
        MongoChatMessageAuditSnapshotDocument before,
        MongoChatMessageAuditSnapshotDocument after
) {

    public static final String COLLECTION_NAME =
            "chat_message_audit_events";

    public MongoChatMessageAuditEventDocument {
        new ChatMessageAuditEvent(
                auditEventId,
                schemaVersion,
                roomId,
                roomChangeSequence,
                eventType,
                messageId,
                roomSequence,
                messageVersion,
                senderMembershipId,
                senderUserId,
                actorUserId,
                actorType,
                occurredAt,
                before == null ? null : before.toDomain(),
                after == null ? null : after.toDomain());
    }

    static MongoChatMessageAuditEventDocument fromDomain(
            ChatMessageAuditEvent event
    ) {
        return new MongoChatMessageAuditEventDocument(
                event.auditEventId(),
                event.schemaVersion(),
                event.roomId(),
                event.roomChangeSequence(),
                event.eventType(),
                event.messageId(),
                event.roomSequence(),
                event.messageVersion(),
                event.senderMembershipId(),
                event.senderUserId(),
                event.actorUserId(),
                event.actorType(),
                event.occurredAt(),
                MongoChatMessageAuditSnapshotDocument.fromDomain(
                        event.before()),
                MongoChatMessageAuditSnapshotDocument.fromDomain(
                        event.after()));
    }

    ChatMessageAuditEvent toDomain() {
        return new ChatMessageAuditEvent(
                auditEventId,
                schemaVersion,
                roomId,
                roomChangeSequence,
                eventType,
                messageId,
                roomSequence,
                messageVersion,
                senderMembershipId,
                senderUserId,
                actorUserId,
                actorType,
                occurredAt,
                before == null ? null : before.toDomain(),
                after.toDomain());
    }
}
