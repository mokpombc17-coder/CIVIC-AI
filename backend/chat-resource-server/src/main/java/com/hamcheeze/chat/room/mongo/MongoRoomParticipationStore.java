package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.ParticipationStatus;
import com.hamcheeze.chat.room.RoomParticipation;
import com.hamcheeze.chat.room.persistence.RoomParticipationStore;
import com.mongodb.client.result.UpdateResult;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.ReplaceOptions;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class MongoRoomParticipationStore
        implements RoomParticipationStore {

    private final MongoOperations mongoOperations;

    public MongoRoomParticipationStore(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    @Override
    public Optional<RoomParticipation> findById(
            String participationId
    ) {
        var document = mongoOperations.findById(
                requireText(participationId, "participationId"),
                MongoRoomParticipationDocument.class,
                MongoRoomParticipationDocument.COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoRoomParticipationDocument::toDomain);
    }

    @Override
    public Optional<RoomParticipation> findActiveByMembershipId(
            String membershipId
    ) {
        Query query = Query.query(Criteria.where("membershipId")
                .is(requireText(membershipId, "membershipId"))
                .and("status")
                .is(ParticipationStatus.ACTIVE.name()));
        var document = mongoOperations.findOne(
                query,
                MongoRoomParticipationDocument.class,
                MongoRoomParticipationDocument.COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoRoomParticipationDocument::toDomain);
    }

    @Override
    public boolean existsByMembershipId(String membershipId) {
        Query query = Query.query(Criteria.where("membershipId")
                .is(requireText(membershipId, "membershipId")));
        query.limit(1);
        return mongoOperations.exists(
                query,
                MongoRoomParticipationDocument.class,
                MongoRoomParticipationDocument.COLLECTION_NAME);
    }

    @Override
    public Optional<RoomParticipation> findLatestByMembershipId(
            String membershipId
    ) {
        Query query = Query.query(Criteria.where("membershipId")
                .is(requireText(membershipId, "membershipId")));
        query.with(Sort.by(
                Sort.Order.desc("joinedAt"),
                Sort.Order.desc("_id")));
        query.limit(1);
        var document = mongoOperations.findOne(
                query,
                MongoRoomParticipationDocument.class,
                MongoRoomParticipationDocument.COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoRoomParticipationDocument::toDomain);
    }

    @Override
    public List<RoomParticipation> findByRoomId(String roomId) {
        Query query = Query.query(Criteria.where("roomId")
                .is(requireText(roomId, "roomId")));
        query.with(Sort.by(
                Sort.Order.asc("joinedAt"),
                Sort.Order.asc("_id")));
        return mongoOperations.find(
                        query,
                        MongoRoomParticipationDocument.class,
                        MongoRoomParticipationDocument.COLLECTION_NAME)
                .stream()
                .map(MongoRoomParticipationDocument::toDomain)
                .toList();
    }

    @Override
    public void insert(RoomParticipation participation) {
        mongoOperations.insert(
                MongoRoomParticipationDocument.fromDomain(
                        Objects.requireNonNull(
                                participation, "participation")),
                MongoRoomParticipationDocument.COLLECTION_NAME);
    }

    @Override
    public boolean replaceIfVersionMatches(
            RoomParticipation participation,
            long expectedVersion
    ) {
        RoomParticipation replacement = Objects.requireNonNull(
                participation, "participation");
        if (expectedVersion < 0
                || replacement.version() != expectedVersion + 1) {
            throw new IllegalArgumentException(
                    "participation.version must equal expectedVersion + 1");
        }
        Query query = Query.query(Criteria.where("_id")
                .is(replacement.participationId())
                .and("version")
                .is(expectedVersion));
        UpdateResult result = mongoOperations.replace(
                query,
                MongoRoomParticipationDocument.fromDomain(replacement),
                ReplaceOptions.none(),
                MongoRoomParticipationDocument.COLLECTION_NAME);
        return result.getModifiedCount() == 1;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    field + " must not be blank");
        }
        return value;
    }
}
