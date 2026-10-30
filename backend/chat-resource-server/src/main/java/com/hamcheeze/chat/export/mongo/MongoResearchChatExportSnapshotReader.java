package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.ChatExportRoomSnapshot;
import com.hamcheeze.chat.export.ChatExportSnapshotUnstableException;
import com.hamcheeze.chat.export.ResearchChatExportCategorySnapshot;
import com.hamcheeze.chat.export.ResearchChatExportParticipantSnapshot;
import com.hamcheeze.chat.export.ResearchChatExportSnapshot;
import com.hamcheeze.chat.export.ResearchChatExportSnapshotReader;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.category.mongo.MongoRoomCategoryDocument;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Instant;
import java.util.List;
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
            List<ResearchChatExportCategorySnapshot> categories =
                    categories(first);
            List<ResearchChatExportParticipantSnapshot> participants =
                    memberships(roomId);
            Room second = room(roomId);
            if (second != null
                    && first.version() == second.version()
                    && first.status() == second.status()) {
                return Optional.of(new ResearchChatExportSnapshot(
                        snapshot(second, capturedAt),
                        categories,
                        participants,
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

    private List<ResearchChatExportCategorySnapshot> categories(Room room) {
        return room.categoryIds().stream()
                .map(this::category)
                .toList();
    }

    private ResearchChatExportCategorySnapshot category(String categoryId) {
        MongoRoomCategoryDocument document = mongoOperations.findById(
                categoryId,
                MongoRoomCategoryDocument.class,
                MongoRoomCategoryDocument.COLLECTION_NAME);
        if (document == null) {
            throw new ChatExportSnapshotUnstableException(
                    "Research room category snapshot is missing");
        }
        return new ResearchChatExportCategorySnapshot(
                document.categoryId(),
                document.name());
    }

    private List<ResearchChatExportParticipantSnapshot> memberships(
            String roomId
    ) {
        Query query = Query.query(Criteria.where("roomId").is(roomId))
                .with(Sort.by(
                        Sort.Order.asc("profile.participantNumber"),
                        Sort.Order.asc("_id")));
        return mongoOperations.find(
                        query,
                        MongoMembershipDocument.class,
                        MongoMembershipDocument.COLLECTION_NAME)
                .stream()
                .map(MongoMembershipDocument::toDomain)
                .map(this::participant)
                .toList();
    }

    private ResearchChatExportParticipantSnapshot participant(
            Membership membership
    ) {
        return new ResearchChatExportParticipantSnapshot(
                membership.userId(),
                membership.status());
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
