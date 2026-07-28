package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.mongodb.client.result.UpdateResult;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.ReplaceOptions;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.util.Objects;
import java.util.Optional;

public final class MongoMembershipStore
        implements MembershipStore {

    private final MongoOperations mongoOperations;

    public MongoMembershipStore(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    @Override
    public Optional<Membership> findById(String membershipId) {
        String id = requireNonBlank(
                membershipId,
                "membershipId");
        MongoMembershipDocument document =
                mongoOperations.findById(
                        id,
                        MongoMembershipDocument.class,
                        MongoMembershipDocument.COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoMembershipDocument::toDomain);
    }

    @Override
    public Optional<Membership> findByRoomIdAndUserId(
            String roomId,
            String userId
    ) {
        Query query = Query.query(
                Criteria.where("roomId")
                        .is(requireNonBlank(roomId, "roomId"))
                        .and("userId")
                        .is(requireNonBlank(userId, "userId")));
        MongoMembershipDocument document =
                mongoOperations.findOne(
                        query,
                        MongoMembershipDocument.class,
                        MongoMembershipDocument.COLLECTION_NAME);
        return Optional.ofNullable(document)
                .map(MongoMembershipDocument::toDomain);
    }

    @Override
    public void insert(Membership membership) {
        mongoOperations.insert(
                MongoMembershipDocument.fromDomain(
                        Objects.requireNonNull(
                                membership,
                                "membership")),
                MongoMembershipDocument.COLLECTION_NAME);
    }

    @Override
    public boolean replaceIfVersionMatches(
            Membership membership,
            long expectedVersion
    ) {
        Membership replacement =
                Objects.requireNonNull(membership, "membership");
        requireNextVersion(
                expectedVersion,
                replacement.version());
        Query query = Query.query(
                Criteria.where("_id")
                        .is(replacement.membershipId())
                        .and("roomId")
                        .is(replacement.roomId())
                        .and("userId")
                        .is(replacement.userId())
                        .and("version")
                        .is(expectedVersion));
        UpdateResult result = mongoOperations.replace(
                query,
                MongoMembershipDocument.fromDomain(replacement),
                ReplaceOptions.none(),
                MongoMembershipDocument.COLLECTION_NAME);
        return result.getModifiedCount() == 1;
    }

    private static void requireNextVersion(
            long expectedVersion,
            long actualVersion
    ) {
        if (expectedVersion < 0
                || expectedVersion == Long.MAX_VALUE
                || actualVersion != expectedVersion + 1) {
            throw new IllegalArgumentException(
                    "membership.version must equal "
                            + "expectedVersion + 1");
        }
    }

    private static String requireNonBlank(
            String value,
            String fieldName
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    fieldName + " must not be blank");
        }
        return value;
    }
}
