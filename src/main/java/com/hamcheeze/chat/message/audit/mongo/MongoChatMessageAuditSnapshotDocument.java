package com.hamcheeze.chat.message.audit.mongo;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.message.audit.ChatMessageAuditSnapshot;

import java.time.Instant;

public record MongoChatMessageAuditSnapshotDocument(
        String content,
        MessageState state,
        boolean countable,
        long messageVersion,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {

    public MongoChatMessageAuditSnapshotDocument {
        new ChatMessageAuditSnapshot(
                content,
                state,
                countable,
                messageVersion,
                createdAt,
                updatedAt,
                deletedAt);
    }

    static MongoChatMessageAuditSnapshotDocument fromDomain(
            ChatMessageAuditSnapshot snapshot
    ) {
        if (snapshot == null) {
            return null;
        }
        return new MongoChatMessageAuditSnapshotDocument(
                snapshot.content(),
                snapshot.state(),
                snapshot.countable(),
                snapshot.messageVersion(),
                snapshot.createdAt(),
                snapshot.updatedAt(),
                snapshot.deletedAt());
    }

    ChatMessageAuditSnapshot toDomain() {
        return new ChatMessageAuditSnapshot(
                content,
                state,
                countable,
                messageVersion,
                createdAt,
                updatedAt,
                deletedAt);
    }
}
