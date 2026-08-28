package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.ChatExportRoomSnapshot;
import com.hamcheeze.chat.export.ChatExportSnapshotUnstableException;
import com.hamcheeze.chat.export.ResearchChatExportSnapshot;
import com.hamcheeze.chat.export.ResearchChatExportSnapshotReader;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class MongoResearchChatExportSnapshotReader
        implements ResearchChatExportSnapshotReader {

    private final MongoOperations mongoOperations;
    private final ChatMessageAuditReader auditReader;

    public MongoResearchChatExportSnapshotReader(
            MongoOperations mongoOperations,
            ChatMessageAuditReader auditReader
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
        this.auditReader = Objects.requireNonNull(
                auditReader,
                "auditReader");
    }

    @Override
    public Optional<ResearchChatExportSnapshot> findStable(
            String roomId,
            Instant capturedAt,
            int maxAttempts
    ) {
        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            Room first = room(roomId);
            if (first == null) {
                if (attempt == 0) {
                    return Optional.empty();
                }
                continue;
            }
            long watermark = auditReader.currentRoomChangeSequence(roomId);
            Room second = room(roomId);
            if (second != null
                    && first.version() == second.version()
                    && first.status() == second.status()) {
                return Optional.of(new ResearchChatExportSnapshot(
                        snapshot(second, capturedAt),
                        watermark,
                        capturedAt));
            }
        }
        throw new ChatExportSnapshotUnstableException(
                "Research room snapshot did not stabilize");
    }

    private Room room(String roomId) {
        MongoRoomDocument document = mongoOperations.findById(
                roomId,
                MongoRoomDocument.class,
                MongoRoomDocument.COLLECTION_NAME);
        return document == null ? null : document.toDomain();
    }

    private ChatExportRoomSnapshot snapshot(Room room, Instant capturedAt) {
        return new ChatExportRoomSnapshot(
                room.roomId(),
                room.name(),
                room.description(),
                room.categoryIds(),
                room.status(),
                room.visibility(),
                room.joinPolicy(),
                room.ownerMembershipId(),
                room.version(),
                room.createdAt(),
                room.closedAt(),
                capturedAt);
    }
}
