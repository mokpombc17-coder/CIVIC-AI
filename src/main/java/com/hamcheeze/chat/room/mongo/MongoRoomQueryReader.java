package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.RoomVisibility;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.hamcheeze.chat.room.query.ListedRoomQueryCriteria;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

public final class MongoRoomQueryReader
        implements RoomQueryReader {

    private final MongoOperations mongoOperations;
    private final Duration listedRoomPageQueryMaxTime;

    public MongoRoomQueryReader(
            MongoOperations mongoOperations,
            Duration listedRoomPageQueryMaxTime
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
        this.listedRoomPageQueryMaxTime =
                Objects.requireNonNull(
                        listedRoomPageQueryMaxTime,
                        "listedRoomPageQueryMaxTime");
    }

    @Override
    public Optional<Room> findRoomById(String roomId) {
        requireText(roomId, "roomId");
        MongoRoomDocument document = mongoOperations.findById(
                roomId,
                MongoRoomDocument.class);
        return Optional.ofNullable(document)
                .map(MongoRoomDocument::toDomain);
    }

    @Override
    public Optional<Membership> findMembership(
            String roomId,
            String userId
    ) {
        requireText(roomId, "roomId");
        requireText(userId, "userId");
        Query query = Query.query(Criteria.where("roomId")
                .is(roomId)
                .and("userId").is(userId));
        MongoMembershipDocument document =
                mongoOperations.findOne(
                        query,
                        MongoMembershipDocument.class);
        return Optional.ofNullable(document)
                .map(MongoMembershipDocument::toDomain);
    }

    @Override
    public CursorSlice<Membership>
            findMembershipsByUserAndStatus(
                    String userId,
                    MembershipStatus status,
                    String afterMembershipId,
                    int limit
            ) {
        requireText(userId, "userId");
        Objects.requireNonNull(status, "status");
        Criteria criteria = Criteria.where("userId")
                .is(userId)
                .and("status").is(status);
        return findMemberships(
                criteria,
                afterMembershipId,
                limit);
    }

    @Override
    public CursorSlice<Membership>
            findMembershipsByRoomAndStatus(
                    String roomId,
                    MembershipStatus status,
                    String afterMembershipId,
                    int limit
            ) {
        requireText(roomId, "roomId");
        Objects.requireNonNull(status, "status");
        Criteria criteria = Criteria.where("roomId")
                .is(roomId)
                .and("status").is(status);
        return findMemberships(
                criteria,
                afterMembershipId,
                limit);
    }

    @Override
    public List<Room> findRoomsByIds(List<String> roomIds) {
        Objects.requireNonNull(roomIds, "roomIds");
        if (roomIds.isEmpty()) {
            return List.of();
        }
        roomIds.forEach(roomId -> requireText(roomId, "roomId"));
        return mongoOperations.find(
                        Query.query(Criteria.where("_id").in(roomIds)),
                        MongoRoomDocument.class)
                .stream()
                .map(MongoRoomDocument::toDomain)
                .toList();
    }

    @Override
    public CursorSlice<Room> findListedRooms(
            ListedRoomQueryCriteria listedCriteria,
            String afterRoomId,
            int limit
    ) {
        Objects.requireNonNull(listedCriteria, "listedCriteria");
        if (limit < 1) {
            throw new IllegalArgumentException(
                    "limit must be positive");
        }
        Criteria criteria = Criteria.where("status")
                .is(RoomStatus.ACTIVE)
                .and("visibility")
                .is(RoomVisibility.LISTED);
        if (listedCriteria.joinPolicy() != null) {
            criteria = criteria.and("joinPolicy")
                    .is(listedCriteria.joinPolicy());
        }
        if (listedCriteria.categoryId() != null) {
            criteria = criteria.and("categoryIds")
                    .is(listedCriteria.categoryId());
        }
        if (listedCriteria.nameContains() != null) {
            criteria = criteria.and("name").regex(Pattern.compile(
                    Pattern.quote(listedCriteria.nameContains()),
                    Pattern.CASE_INSENSITIVE
                            | Pattern.UNICODE_CASE));
        }
        if (afterRoomId != null) {
            requireText(afterRoomId, "afterRoomId");
            criteria = criteria.and("_id").gt(afterRoomId);
        }
        List<Room> found = mongoOperations.find(
                        Query.query(criteria)
                                .with(Sort.by(
                                        Sort.Direction.ASC,
                                        "_id"))
                                .limit(limit + 1)
                                .maxTime(
                                        listedRoomPageQueryMaxTime),
                        MongoRoomDocument.class)
                .stream()
                .map(MongoRoomDocument::toDomain)
                .toList();
        boolean hasNext = found.size() > limit;
        return new CursorSlice<>(
                hasNext ? found.subList(0, limit) : found,
                hasNext);
    }

    private CursorSlice<Membership> findMemberships(
            Criteria criteria,
            String afterMembershipId,
            int limit
    ) {
        if (limit < 1) {
            throw new IllegalArgumentException(
                    "limit must be positive");
        }
        if (afterMembershipId != null) {
            requireText(afterMembershipId, "afterMembershipId");
            criteria = new Criteria().andOperator(
                    criteria,
                    Criteria.where("_id").gt(afterMembershipId));
        }
        Query query = Query.query(criteria)
                .with(Sort.by(
                        Sort.Direction.ASC,
                        "_id"))
                .limit(limit + 1);
        List<Membership> found = mongoOperations.find(
                        query,
                        MongoMembershipDocument.class)
                .stream()
                .map(MongoMembershipDocument::toDomain)
                .toList();
        boolean hasNext = found.size() > limit;
        List<Membership> items = hasNext
                ? found.subList(0, limit)
                : found;
        return new CursorSlice<>(items, hasNext);
    }

    private static void requireText(
            String value,
            String name
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    name + " must not be blank");
        }
    }
}
