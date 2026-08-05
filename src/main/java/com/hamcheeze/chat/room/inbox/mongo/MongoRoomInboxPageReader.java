package com.hamcheeze.chat.room.inbox.mongo;

import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.Membership;
import com.hamcheeze.chat.room.MembershipStatus;
import com.hamcheeze.chat.room.Room;
import com.hamcheeze.chat.room.RoomStatus;
import com.hamcheeze.chat.room.inbox.RoomInboxCursor;
import com.hamcheeze.chat.room.inbox.RoomInboxDataConsistencyException;
import com.hamcheeze.chat.room.inbox.RoomInboxPageEntry;
import com.hamcheeze.chat.room.inbox.RoomInboxPageReader;
import com.hamcheeze.chat.room.inbox.RoomInboxProperties;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.hamcheeze.chat.room.mongo.MongoMembershipDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomDocument;
import com.hamcheeze.chat.room.mongo.MongoRoomSchemaInitializer;
import com.hamcheeze.chat.room.query.CursorSlice;
import com.mongodb.client.AggregateIterable;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

public final class MongoRoomInboxPageReader
        implements RoomInboxPageReader {

    private final MongoOperations mongoOperations;
    private final long maxTimeMillis;

    public MongoRoomInboxPageReader(
            MongoOperations mongoOperations,
            RoomInboxProperties properties
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
        Objects.requireNonNull(properties, "properties");
        this.maxTimeMillis = properties.getPageQueryMaxTime()
                .toMillis();
    }

    @Override
    public CursorSlice<RoomInboxPageEntry> findPage(
            String userId,
            RoomInboxCursor cursor,
            int limit
    ) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException(
                    "userId must not be blank");
        }
        if (limit < 1) {
            throw new IllegalArgumentException(
                    "limit must be positive");
        }
        AggregateIterable<Document> aggregation = mongoOperations
                .getCollection(MongoMembershipDocument.COLLECTION_NAME)
                .aggregate(pipeline(userId, cursor, limit))
                .hintString(MongoRoomSchemaInitializer
                        .MEMBERSHIP_USER_STATUS_INDEX_NAME)
                .allowDiskUse(false)
                .maxTime(maxTimeMillis, TimeUnit.MILLISECONDS);
        List<RoomInboxPageEntry> found = new ArrayList<>();
        for (Document document : aggregation) {
            found.add(map(document));
        }
        boolean hasNext = found.size() > limit;
        return new CursorSlice<>(
                hasNext ? List.copyOf(found.subList(0, limit))
                        : List.copyOf(found),
                hasNext);
    }

    static List<Document> pipeline(
            String userId,
            RoomInboxCursor cursor,
            int limit
    ) {
        List<Document> stages = new ArrayList<>();
        stages.add(new Document("$match", new Document(
                "userId", userId)
                .append("status", MembershipStatus.ACTIVE.name())));
        stages.add(lookup(
                MongoRoomDocument.COLLECTION_NAME,
                "roomId",
                "_id",
                "roomLookup"));
        stages.add(lookup(
                MongoRoomInboxSummaryDocument.COLLECTION_NAME,
                "roomId",
                "_id",
                "summaryLookup"));
        stages.add(new Document("$set", new Document(
                "roomLookupCount",
                new Document("$size", "$roomLookup"))
                .append("summaryLookupCount",
                        new Document("$size", "$summaryLookup"))
                .append("room",
                        new Document("$arrayElemAt",
                                List.of("$roomLookup", 0)))
                .append("summary",
                        new Document("$arrayElemAt",
                                List.of("$summaryLookup", 0)))));
        stages.add(new Document("$match", new Document(
                "$expr", new Document("$or", List.of(
                        new Document("$ne", List.of(
                                "$roomLookupCount", 1)),
                        new Document("$eq", List.of(
                                "$room.status",
                                RoomStatus.ACTIVE.name())))))));
        stages.add(new Document("$set", new Document(
                "summaryVisible",
                new Document("$and", List.of(
                        new Document("$eq", List.of(
                                "$summaryLookupCount", 1)),
                        new Document("$gt", List.of(
                                "$summary.lastMessage.roomSequence",
                                "$messageVisibleAfterSequence")))))));
        stages.add(new Document("$set", new Document(
                "effectiveLastActivityAt",
                new Document("$cond", List.of(
                        "$summaryVisible",
                        "$summary.lastActivityAt",
                        "$joinedAt")))));
        if (cursor != null) {
            Document afterCursor = new Document("$or", List.of(
                    new Document("$lt", List.of(
                            "$effectiveLastActivityAt",
                            Date.from(cursor.lastActivityAt()))),
                    new Document("$and", List.of(
                            new Document("$eq", List.of(
                                    "$effectiveLastActivityAt",
                                    Date.from(cursor.lastActivityAt()))),
                            new Document("$lt", List.of(
                                    "$roomId",
                                    cursor.lastRoomId()))))));
            Document invalidLookup = new Document("$or", List.of(
                    new Document("$ne", List.of(
                            "$roomLookupCount", 1)),
                    new Document("$gt", List.of(
                            "$summaryLookupCount", 1))));
            stages.add(new Document("$match", new Document(
                    "$expr", new Document("$or", List.of(
                            invalidLookup,
                            afterCursor)))));
        }
        stages.add(new Document("$sort", new Document(
                "effectiveLastActivityAt", -1)
                .append("roomId", -1)));
        stages.add(new Document("$limit", limit + 1L));
        stages.add(new Document("$project", new Document(
                "membership", membershipProjection())
                .append("room", "$room")
                .append("summary", "$summary")
                .append("roomLookupCount", 1)
                .append("summaryLookupCount", 1)
                .append("summaryVisible", 1)
                .append("effectiveLastActivityAt", 1)));
        return List.copyOf(stages);
    }

    private RoomInboxPageEntry map(Document result) {
        Document membershipRaw = result.get(
                "membership", Document.class);
        Document roomRaw = result.get("room", Document.class);
        int roomCount = integer(result, "roomLookupCount", null);
        int summaryCount = integer(
                result, "summaryLookupCount", null);
        String roomId = membershipRaw == null
                ? null : string(membershipRaw, "roomId");
        if (roomCount != 1 || roomRaw == null) {
            throw inconsistent(roomId, null,
                    "room-lookup-cardinality");
        }
        if (summaryCount < 0 || summaryCount > 1) {
            throw inconsistent(roomId, null,
                    "summary-lookup-cardinality");
        }
        Membership membership;
        Room room;
        try {
            membership = mongoOperations.getConverter()
                    .read(MongoMembershipDocument.class, membershipRaw)
                    .toDomain();
            room = mongoOperations.getConverter()
                    .read(MongoRoomDocument.class, roomRaw)
                    .toDomain();
        } catch (RuntimeException exception) {
            throw inconsistent(roomId, null,
                    "room-or-membership-malformed");
        }
        if (membership.status() != MembershipStatus.ACTIVE
                || room.status() != RoomStatus.ACTIVE
                || !membership.roomId().equals(room.roomId())) {
            throw inconsistent(roomId, null,
                    "room-or-membership-invariant");
        }

        RoomInboxSummary summary = null;
        if (summaryCount == 1) {
            summary = mapSummary(
                    result.get("summary", Document.class), roomId);
        }
        boolean visible = summary != null
                && summary.lastMessage().roomSequence()
                > membership.messageVisibleAfterSequence();
        RoomInboxLastMessage lastMessage = visible
                ? summary.lastMessage() : null;
        Instant expectedActivity = visible
                ? summary.lastActivityAt() : membership.joinedAt();
        Object rawActivity = result.get("effectiveLastActivityAt");
        if (!(rawActivity instanceof Date activity)
                || !expectedActivity.equals(activity.toInstant())) {
            throw inconsistent(roomId,
                    summary == null ? null
                            : MongoRoomInboxSummaryDocument
                            .CURRENT_SCHEMA_VERSION,
                    "effective-activity-mismatch");
        }
        return new RoomInboxPageEntry(
                room, membership, lastMessage, expectedActivity);
    }

    private static RoomInboxSummary mapSummary(
            Document raw,
            String roomId
    ) {
        if (raw == null) {
            throw inconsistent(roomId, null,
                    "summary-missing-after-lookup");
        }
        Object rawSchemaVersion = raw.get("schemaVersion");
        Integer schemaVersion = rawSchemaVersion instanceof Integer value
                ? value : null;
        if (schemaVersion == null) {
            throw inconsistent(roomId, null,
                    "summary-schema-version-type");
        }
        if (schemaVersion
                != MongoRoomInboxSummaryDocument.CURRENT_SCHEMA_VERSION) {
            throw inconsistent(roomId, schemaVersion,
                    "summary-schema-unsupported");
        }
        try {
            if (!(raw.get("_id") instanceof String storedRoomId)
                    || !storedRoomId.equals(roomId)
                    || !(raw.get("lastMessage")
                    instanceof Document message)
                    || !message.containsKey("preview")
                    || !(message.get("messageId") instanceof String messageId)
                    || !(message.get("roomSequence") instanceof Long sequence)
                    || !(message.get("messageVersion") instanceof Long version)
                    || !(message.get("state") instanceof String state)
                    || !(message.get("previewTruncated")
                    instanceof Boolean truncated)
                    || !(message.get("createdAt") instanceof Date createdAt)
                    || !(raw.get("lastActivityAt") instanceof Date activityAt)
                    || !(raw.get("updatedAt") instanceof Date updatedAt)) {
                throw new IllegalArgumentException("invalid BSON types");
            }
            Object preview = message.get("preview");
            if (preview != null && !(preview instanceof String)) {
                throw new IllegalArgumentException("invalid preview type");
            }
            RoomInboxLastMessage lastMessage = new RoomInboxLastMessage(
                    messageId,
                    sequence,
                    version,
                    MessageState.valueOf(state),
                    (String) preview,
                    truncated,
                    createdAt.toInstant());
            return new RoomInboxSummary(
                    storedRoomId,
                    lastMessage,
                    activityAt.toInstant(),
                    updatedAt.toInstant());
        } catch (RuntimeException exception) {
            throw inconsistent(roomId, schemaVersion,
                    "summary-malformed");
        }
    }

    private static Document lookup(
            String collection,
            String localField,
            String foreignField,
            String alias
    ) {
        return new Document("$lookup", new Document(
                "from", collection)
                .append("localField", localField)
                .append("foreignField", foreignField)
                .append("as", alias));
    }

    private static Document membershipProjection() {
        return new Document("_id", "$_id")
                .append("schemaVersion", "$schemaVersion")
                .append("roomId", "$roomId")
                .append("userId", "$userId")
                .append("role", "$role")
                .append("status", "$status")
                .append("joinedAt", "$joinedAt")
                .append("leftAt", "$leftAt")
                .append("bannedAt", "$bannedAt")
                .append("messageVisibleAfterSequence",
                        "$messageVisibleAfterSequence")
                .append("version", "$version");
    }

    private static int integer(
            Document document,
            String field,
            String roomId
    ) {
        Object value = document.get(field);
        if (!(value instanceof Integer number)) {
            throw inconsistent(roomId, null,
                    "aggregation-result-malformed");
        }
        return number;
    }

    private static String string(Document document, String field) {
        Object value = document.get(field);
        return value instanceof String text ? text : null;
    }

    private static RoomInboxDataConsistencyException inconsistent(
            String roomId,
            Integer schemaVersion,
            String failureKind
    ) {
        return new RoomInboxDataConsistencyException(
                roomId, schemaVersion, failureKind);
    }
}
