package com.hamcheeze.chat.room.inbox.mongo;

import com.hamcheeze.chat.room.inbox.RoomReadState;
import com.hamcheeze.chat.room.inbox.RoomReadStateAdvance;
import com.hamcheeze.chat.room.inbox.RoomReadStateStore;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class MongoRoomReadStateStore
        implements RoomReadStateStore {

    static final int MAX_ADVANCE_ATTEMPTS = 3;

    private final MongoOperations mongoOperations;

    public MongoRoomReadStateStore(MongoOperations mongoOperations) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    @Override
    public Optional<RoomReadState> findByMembershipId(
            String membershipId
    ) {
        requireText(membershipId, "membershipId");
        return Optional.ofNullable(mongoOperations.findById(
                        membershipId,
                        MongoRoomReadStateDocument.class,
                        MongoRoomReadStateDocument.COLLECTION_NAME))
                .map(MongoRoomReadStateDocument::toDomain);
    }

    @Override
    public Map<String, RoomReadState> findByMembershipIds(
            List<String> membershipIds
    ) {
        Objects.requireNonNull(membershipIds, "membershipIds");
        if (membershipIds.isEmpty()) {
            return Map.of();
        }
        membershipIds.forEach(value -> requireText(
                value, "membershipId"));
        return mongoOperations.find(
                        Query.query(Criteria.where("_id")
                                .in(membershipIds)),
                        MongoRoomReadStateDocument.class,
                        MongoRoomReadStateDocument.COLLECTION_NAME)
                .stream()
                .map(MongoRoomReadStateDocument::toDomain)
                .collect(Collectors.toUnmodifiableMap(
                        RoomReadState::membershipId,
                        Function.identity()));
    }

    @Override
    public RoomReadStateAdvance advance(
            String membershipId,
            String roomId,
            String userId,
            long throughSequence,
            Instant updatedAt
    ) {
        RoomReadState candidate = new RoomReadState(
                membershipId,
                roomId,
                userId,
                throughSequence,
                updatedAt);
        DuplicateKeyException lastDuplicate = null;
        for (int attempt = 1;
             attempt <= MAX_ADVANCE_ATTEMPTS;
             attempt++) {
            Query updateQuery = Query.query(new Criteria().andOperator(
                    Criteria.where("_id").is(membershipId),
                    Criteria.where("roomId").is(roomId),
                    Criteria.where("userId").is(userId),
                    Criteria.where("lastReadSequence")
                            .lt(throughSequence)));
            long modified = mongoOperations.updateFirst(
                            updateQuery,
                            new Update()
                                    .set("lastReadSequence",
                                            throughSequence)
                                    .set("updatedAt", updatedAt),
                            MongoRoomReadStateDocument.COLLECTION_NAME)
                    .getModifiedCount();
            if (modified == 1) {
                RoomReadState stored = findByMembershipId(
                        membershipId).orElseThrow();
                verifyIdentity(stored, candidate);
                if (stored.lastReadSequence() < throughSequence) {
                    throw new IllegalStateException(
                            "Advanced read state is below requested sequence");
                }
                return new RoomReadStateAdvance(stored, true);
            }
            RoomReadState existing = findByMembershipId(
                    membershipId).orElse(null);
            if (existing != null) {
                verifyIdentity(existing, candidate);
                if (existing.lastReadSequence() >= throughSequence) {
                    return new RoomReadStateAdvance(existing, false);
                }
                continue;
            }
            try {
                MongoRoomReadStateDocument inserted =
                        new MongoRoomReadStateDocument(
                                membershipId,
                                MongoRoomReadStateDocument
                                        .CURRENT_SCHEMA_VERSION,
                                roomId,
                                userId,
                                throughSequence,
                                updatedAt);
                mongoOperations.insert(
                        inserted,
                        MongoRoomReadStateDocument.COLLECTION_NAME);
                return new RoomReadStateAdvance(
                        inserted.toDomain(), true);
            } catch (DuplicateKeyException exception) {
                lastDuplicate = exception;
            }
        }
        RoomReadState finalState = findByMembershipId(
                membershipId).orElse(null);
        if (finalState != null) {
            verifyIdentity(finalState, candidate);
            if (finalState.lastReadSequence() >= throughSequence) {
                return new RoomReadStateAdvance(finalState, false);
            }
            throw new ConcurrencyFailureException(
                    "Room read state advance did not converge");
        }
        if (lastDuplicate != null) {
            throw lastDuplicate;
        }
        throw new ConcurrencyFailureException(
                "Room read state advance did not converge");
    }

    private static void verifyIdentity(
            RoomReadState stored,
            RoomReadState candidate
    ) {
        if (!stored.membershipId().equals(candidate.membershipId())
                || !stored.roomId().equals(candidate.roomId())
                || !stored.userId().equals(candidate.userId())) {
            throw new IllegalStateException(
                    "Room read state identity collision");
        }
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    name + " must not be blank");
        }
    }
}
