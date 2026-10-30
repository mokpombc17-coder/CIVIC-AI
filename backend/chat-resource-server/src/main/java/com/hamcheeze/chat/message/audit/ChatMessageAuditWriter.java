package com.hamcheeze.chat.message.audit;

import com.hamcheeze.chat.message.ChatMessage;

public interface ChatMessageAuditWriter {

    ChatMessageAuditEvent appendCreated(
            ChatMessage created,
            String actorUserId,
            ChatMessageAuditActorType actorType);

    ChatMessageAuditEvent appendUpdated(
            ChatMessage before,
            ChatMessage after,
            String actorUserId,
            ChatMessageAuditActorType actorType);

    ChatMessageAuditEvent appendDeleted(
            ChatMessage before,
            ChatMessage after,
            String actorUserId,
            ChatMessageAuditActorType actorType);
}
