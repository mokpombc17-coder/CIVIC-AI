package com.hamcheeze.chat.export;

import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEventType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditSnapshot;

import java.time.Instant;

public record ChatExportEventRecord(
        int recordVersion,
        String auditEventId,
        int auditSchemaVersion,
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
        ChatMessageAuditSnapshot before,
        ChatMessageAuditSnapshot after
) {

    public static ChatExportEventRecord from(ChatMessageAuditEvent event) {
        return new ChatExportEventRecord(
                1,
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
                event.before(),
                event.after());
    }
}
