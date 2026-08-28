package com.hamcheeze.chat.export.mongo;

import com.hamcheeze.chat.export.ChatExportParticipantSnapshot;
import com.hamcheeze.chat.export.ChatExportRoomSnapshot;
import com.hamcheeze.chat.export.ChatExportSnapshot;
import com.hamcheeze.chat.export.ChatExportSnapshotReader;
import com.hamcheeze.chat.export.ChatExportSnapshotUnstableException;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipProfile;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class MongoChatExportSnapshotReader
        implements ChatExportSnapshotReader {

    private final MongoOperations mongoOperations;

    public MongoChatExportSnapshotReader(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public Optional<ChatExportSnapshot> findStable(
            String roomId,
            Instant capturedAt,
            int maxAttempts
    ) {
        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            Room first = room(roomId);
            if (first == null) {
                return Optional.empty();
            }
            List<ChatExportParticipantSnapshot> participants =
                    memberships(roomId, capturedAt);
            Room second = room(roomId);
            if (second != null
                    && first.version() == second.version()
                    && first.status() == second.status()) {
                return Optional.of(new ChatExportSnapshot(
                        snapshot(second, capturedAt),
                        participants));
            }
        }
        throw new ChatExportSnapshotUnstableException(
                "Room snapshot did not stabilize");
    }

    private Room room(String roomId) {
        MongoRoomDocument document = mongoOperations.findById(
                roomId,
                MongoRoomDocument.class,
                MongoRoomDocument.COLLECTION_NAME);
        return document == null ? null : document.toDomain();
    }

    private List<ChatExportParticipantSnapshot> memberships(
            String roomId,
            Instant capturedAt
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
                .map(membership -> participant(
                        membership,
                        capturedAt))
                .sorted(Comparator
                        .comparing(
                                ChatExportParticipantSnapshot
                                        ::participantNumber,
                                Comparator.nullsLast(Long::compareTo))
                        .thenComparing(
                                ChatExportParticipantSnapshot::membershipId))
                .toList();
    }

    private ChatExportParticipantSnapshot participant(
            Membership membership,
            Instant capturedAt
    ) {
        MembershipProfile profile = membership.profile();
        return new ChatExportParticipantSnapshot(
                1,
                membership.membershipId(),
                membership.userId(),
                profile.participantNumber(),
                profile.displayName(),
                membership.role(),
                membership.status(),
                membership.joinedAt(),
                membership.leftAt(),
                membership.bannedAt(),
                membership.version(),
                profile.version(),
                true,
                capturedAt);
    }

    private ChatExportRoomSnapshot snapshot(
            Room room,
            Instant capturedAt
    ) {
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
