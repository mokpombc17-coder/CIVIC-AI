package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.authorization.RoomAccessReadException;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.authorization.RoomAccessSnapshot;
import com.hamcheeze.chat.room.authorization.RoomAccessState;
import com.hamcheeze.chat.room.authorization.RoomAuthorizationProperties;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;

import static org.springframework.data.mongodb.core.query.Criteria.where;

public final class MongoRoomAccessReader implements RoomAccessReader {

    private final MongoOperations mongoOperations;
    private final int maxConsistencyAttempts;

    public MongoRoomAccessReader(
            MongoOperations mongoOperations,
            RoomAuthorizationProperties properties
    ) {
        this.mongoOperations = mongoOperations;
        this.maxConsistencyAttempts =
                properties.getMaxConsistencyAttempts();
    }

    @Override
    public RoomAccessSnapshot readAccess(
            String userId,
            String roomId
    ) {
        try {
            for (int attempt = 1;
                 attempt <= maxConsistencyAttempts;
                 attempt++) {
                RoomProjection first = findRoom(roomId);
                if (first == null) {
                    return RoomAccessSnapshot.roomNotFound(roomId);
                }
                if (first.status() == RoomStatus.CLOSED) {
                    return new RoomAccessSnapshot(
                            roomId,
                            first.status(),
                            first.version(),
                            null,
                            null,
                            null,
                            RoomAccessState.ROOM_CLOSED);
                }

                MembershipProjection membership =
                        findMembership(roomId, userId);
                RoomProjection second = findRoom(roomId);
                if (second == null
                        || first.version() != second.version()
                        || first.status() != second.status()) {
                    continue;
                }
                if (second.status() == RoomStatus.CLOSED) {
                    return new RoomAccessSnapshot(
                            roomId,
                            second.status(),
                            second.version(),
                            null,
                            null,
                            null,
                            RoomAccessState.ROOM_CLOSED);
                }
                if (membership == null) {
                    return new RoomAccessSnapshot(
                            roomId,
                            second.status(),
                            second.version(),
                            null,
                            null,
                            null,
                            RoomAccessState.MEMBERSHIP_NOT_FOUND);
                }
                return new RoomAccessSnapshot(
                        roomId,
                        second.status(),
                        second.version(),
                        membership.status(),
                        membership.version(),
                        membership.messageVisibleAfterSequence(),
                        state(membership.status()));
            }
            throw new RoomAccessReadException(
                    "Could not obtain a stable Room access snapshot");
        } catch (RoomAccessReadException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new RoomAccessReadException(
                    "Failed to read Room access snapshot",
                    exception);
        }
    }

    private RoomProjection findRoom(String roomId) {
        Query query = Query.query(where("_id").is(roomId));
        query.fields()
                .include("_id")
                .include("schemaVersion")
                .include("status")
                .include("version");
        Document document = mongoOperations.findOne(
                query,
                Document.class,
                MongoRoomDocument.COLLECTION_NAME);
        if (document == null) {
            return null;
        }
        requireSchema(
                document,
                MongoRoomDocument.COLLECTION_NAME,
                MongoRoomDocument.LEGACY_SCHEMA_VERSION,
                MongoRoomDocument.CURRENT_SCHEMA_VERSION);
        return new RoomProjection(
                enumValue(document, "status", RoomStatus.class),
                longValue(document, "version"));
    }

    private MembershipProjection findMembership(
            String roomId,
            String userId
    ) {
        Query query = Query.query(
                where("roomId").is(roomId)
                        .and("userId").is(userId));
        query.fields()
                .include("schemaVersion")
                .include("roomId")
                .include("userId")
                .include("status")
                .include("messageVisibleAfterSequence")
                .include("version");
        Document document = mongoOperations.findOne(
                query,
                Document.class,
                MongoMembershipDocument.COLLECTION_NAME);
        if (document == null) {
            return null;
        }
        requireSchema(
                document,
                MongoMembershipDocument.COLLECTION_NAME,
                MongoMembershipDocument.CURRENT_SCHEMA_VERSION);
        if (!roomId.equals(document.getString("roomId"))
                || !userId.equals(document.getString("userId"))) {
            throw new RoomAccessReadException(
                    "Membership identity mismatch");
        }
        return new MembershipProjection(
                enumValue(
                        document,
                        "status",
                        MembershipStatus.class),
                nonNegativeLongValue(
                        document,
                        "messageVisibleAfterSequence"),
                longValue(document, "version"));
    }

    private static RoomAccessState state(MembershipStatus status) {
        return switch (status) {
            case ACTIVE -> RoomAccessState.ACTIVE_MEMBER;
            case LEFT -> RoomAccessState.MEMBERSHIP_LEFT;
            case BANNED -> RoomAccessState.MEMBERSHIP_BANNED;
        };
    }

    private static void requireSchema(
            Document document,
            String collection,
            int... supportedVersions
    ) {
        Number value = document.get("schemaVersion", Number.class);
        if (value != null) {
            for (int supported : supportedVersions) {
                if (value.intValue() == supported) {
                    return;
                }
            }
        }
        throw new RoomAccessReadException(
                "Unsupported schemaVersion in " + collection);
    }

    private static long longValue(
            Document document,
            String field
    ) {
        Number value = document.get(field, Number.class);
        if (value == null || value.longValue() < 0) {
            throw new RoomAccessReadException(
                    "Invalid " + field + " in access snapshot");
        }
        return value.longValue();
    }

    private static long nonNegativeLongValue(
            Document document,
            String field
    ) {
        Number value = document.get(field, Number.class);
        if (value == null || value.longValue() < 0) {
            throw new RoomAccessReadException(
                    "Invalid " + field + " in access snapshot");
        }
        return value.longValue();
    }

    private static <T extends Enum<T>> T enumValue(
            Document document,
            String field,
            Class<T> type
    ) {
        String value = document.getString(field);
        if (value == null) {
            throw new RoomAccessReadException(
                    "Missing " + field + " in access snapshot");
        }
        try {
            return Enum.valueOf(type, value);
        } catch (IllegalArgumentException exception) {
            throw new RoomAccessReadException(
                    "Invalid " + field + " in access snapshot",
                    exception);
        }
    }

    private record RoomProjection(
            RoomStatus status,
            long version
    ) {
    }

    private record MembershipProjection(
            MembershipStatus status,
            long messageVisibleAfterSequence,
            long version
    ) {
    }
}
