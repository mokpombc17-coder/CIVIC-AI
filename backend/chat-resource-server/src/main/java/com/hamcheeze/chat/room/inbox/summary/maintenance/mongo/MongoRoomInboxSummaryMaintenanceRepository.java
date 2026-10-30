package com.hamcheeze.chat.room.inbox.summary.maintenance.mongo;

import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummaryPreview;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceOptions;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.mongodb.client.MongoCursor;
import com.mongodb.client.model.Filters;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Instant;
import java.util.Date;
import java.util.Objects;
import java.util.function.Consumer;

public final class MongoRoomInboxSummaryMaintenanceRepository {

    private final MongoOperations mongoOperations;

    public MongoRoomInboxSummaryMaintenanceRepository(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    public SummaryObservation observe(String roomId) {
        Document document = mongoOperations
                .getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .find(Filters.eq("_id", roomId))
                .first();
        return document == null
                ? SummaryObservation.missing(roomId)
                : map(document);
    }

    public void scan(
            RoomInboxSummaryMaintenanceOptions options,
            Consumer<SummaryObservation> consumer
    ) {
        try (MongoCursor<Document> cursor = mongoOperations
                .getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .find(filter(options))
                .sort(new Document("_id", 1))
                .batchSize(options.batchSize())
                .iterator()) {
            while (cursor.hasNext()) {
                consumer.accept(map(cursor.next()));
            }
        }
    }

    public long count(RoomInboxSummaryMaintenanceOptions options) {
        return mongoOperations
                .getCollection(
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .countDocuments(filter(options));
    }

    public Document replacement(RoomInboxSummary expected) {
        return MongoRoomInboxSummaryDocument
                .fromDomain(expected)
                .toBson();
    }

    public MongoOperations mongoOperations() {
        return mongoOperations;
    }

    private SummaryObservation map(Document document) {
        String roomId = document.get("_id") instanceof String value
                ? value
                : null;
        Object schemaVersion = document.get("schemaVersion");
        if (schemaVersion instanceof Integer version
                && version
                != MongoRoomInboxSummaryDocument.CURRENT_SCHEMA_VERSION) {
            return SummaryObservation.unsupported(roomId, document);
        }
        if (!(schemaVersion instanceof Integer) || roomId == null) {
            return SummaryObservation.malformed(roomId, document);
        }
        StoredSummarySnapshot snapshot = snapshot(document);
        if (snapshot == null) {
            return SummaryObservation.malformed(roomId, document);
        }
        RoomInboxSummary domain = null;
        try {
            MongoRoomInboxSummaryDocument mapped = mongoOperations
                    .getConverter()
                    .read(MongoRoomInboxSummaryDocument.class, document);
            domain = mapped.toDomain();
        } catch (RuntimeException ignored) {
            // A structurally readable v1 snapshot can still be repaired by CAS.
        }
        return SummaryObservation.valid(
                roomId, document, domain, snapshot);
    }

    private static StoredSummarySnapshot snapshot(Document document) {
        Object rawMessage = document.get("lastMessage");
        if (!(rawMessage instanceof Document message)
                || !message.containsKey("preview")
                || !(message.get("messageId") instanceof String messageId)
                || messageId.isBlank()
                || !(message.get("roomSequence") instanceof Long sequence)
                || !(message.get("messageVersion") instanceof Long version)
                || !(message.get("state") instanceof String state)
                || !(message.get("previewTruncated")
                        instanceof Boolean previewTruncated)
                || !(message.get("createdAt") instanceof Date createdAt)
                || !(document.get("lastActivityAt")
                        instanceof Date lastActivityAt)
                || !(document.get("updatedAt") instanceof Date updatedAt)) {
            return null;
        }
        if (sequence < 1 || version < 1) {
            return null;
        }
        Object preview = message.get("preview");
        if (preview != null && !(preview instanceof String)) {
            return null;
        }
        if ("ACTIVE".equals(state)) {
            if (!(preview instanceof String activePreview)) {
                return null;
            }
            try {
                new RoomInboxSummaryPreview(
                        activePreview, previewTruncated);
            } catch (IllegalArgumentException exception) {
                return null;
            }
        } else if ("DELETED_BY_AUTHOR".equals(state)) {
            if (version < 2
                    || preview != null
                    || previewTruncated) {
                return null;
            }
        } else {
            return null;
        }
        return new StoredSummarySnapshot(
                messageId,
                sequence,
                version,
                state,
                (String) preview,
                previewTruncated,
                createdAt.toInstant(),
                lastActivityAt.toInstant(),
                updatedAt.toInstant());
    }

    private static Bson filter(
            RoomInboxSummaryMaintenanceOptions options
    ) {
        if (options.roomId() != null) {
            return Filters.eq("_id", options.roomId());
        }
        if (options.afterRoomId() != null) {
            return Filters.gt("_id", options.afterRoomId());
        }
        return new Document();
    }

    public enum ObservationKind {
        MISSING,
        VALID,
        UNSUPPORTED_SCHEMA,
        MALFORMED
    }

    public record SummaryObservation(
            ObservationKind kind,
            String roomId,
            Document raw,
            RoomInboxSummary summary,
            StoredSummarySnapshot snapshot
    ) {

        public boolean sameSnapshot(SummaryObservation other) {
            return kind == other.kind
                    && Objects.equals(raw, other.raw);
        }

        static SummaryObservation missing(String roomId) {
            return new SummaryObservation(
                    ObservationKind.MISSING,
                    roomId,
                    null,
                    null,
                    null);
        }

        static SummaryObservation valid(
                String roomId,
                Document raw,
                RoomInboxSummary summary,
                StoredSummarySnapshot snapshot
        ) {
            return new SummaryObservation(
                    ObservationKind.VALID,
                    roomId,
                    raw,
                    summary,
                    snapshot);
        }

        static SummaryObservation unsupported(
                String roomId,
                Document raw
        ) {
            return new SummaryObservation(
                    ObservationKind.UNSUPPORTED_SCHEMA,
                    roomId,
                    raw,
                    null,
                    null);
        }

        static SummaryObservation malformed(
                String roomId,
                Document raw
        ) {
            return new SummaryObservation(
                    ObservationKind.MALFORMED,
                    roomId,
                    raw,
                    null,
                    null);
        }
    }

    public record StoredSummarySnapshot(
            String messageId,
            long roomSequence,
            long messageVersion,
            String state,
            String preview,
            boolean previewTruncated,
            Instant createdAt,
            Instant lastActivityAt,
            Instant updatedAt
    ) {
    }
}
