package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.audit.ChatMessageAuditActorType;
import com.hamcheeze.chat.message.audit.ChatMessageAuditEvent;
import com.hamcheeze.chat.message.audit.ChatMessageAuditWriter;

import java.util.Objects;

final class FailingAfterAppendChatMessageAuditWriter
        implements ChatMessageAuditWriter {

    private final ChatMessageAuditWriter delegate;

    FailingAfterAppendChatMessageAuditWriter(
            ChatMessageAuditWriter delegate
    ) {
        this.delegate = Objects.requireNonNull(delegate, "delegate");
    }

    @Override
    public ChatMessageAuditEvent appendCreated(
            ChatMessage created,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        delegate.appendCreated(created, actorUserId, actorType);
        throw failure();
    }

    @Override
    public ChatMessageAuditEvent appendUpdated(
            ChatMessage before,
            ChatMessage after,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        delegate.appendUpdated(
                before,
                after,
                actorUserId,
                actorType);
        throw failure();
    }

    @Override
    public ChatMessageAuditEvent appendDeleted(
            ChatMessage before,
            ChatMessage after,
            String actorUserId,
            ChatMessageAuditActorType actorType
    ) {
        delegate.appendDeleted(
                before,
                after,
                actorUserId,
                actorType);
        throw failure();
    }

    private static IllegalStateException failure() {
        return new IllegalStateException("audit append failure");
    }
}
