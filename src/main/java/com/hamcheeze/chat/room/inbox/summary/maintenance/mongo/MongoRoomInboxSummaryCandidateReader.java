package com.hamcheeze.chat.room.inbox.summary.maintenance.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.mongo.MongoChatMessageDocument;
import com.hamcheeze.chat.message.mongo.MongoChatMessageSchemaInitializer;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryCandidate;
import com.hamcheeze.chat.room.inbox.summary.maintenance.RoomInboxSummaryMaintenanceOptions;
import com.mongodb.client.FindIterable;
import com.mongodb.client.MongoCursor;
import com.mongodb.client.model.Filters;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.springframework.data.mongodb.core.MongoOperations;

import java.util.Date;
import java.util.Objects;

public final class MongoRoomInboxSummaryCandidateReader {

    private final MongoOperations mongoOperations;

    public MongoRoomInboxSummaryCandidateReader(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    public void scan(
            RoomInboxSummaryMaintenanceOptions options,
            CandidateVisitor visitor
    ) {
        Objects.requireNonNull(options, "options");
        Objects.requireNonNull(visitor, "visitor");
        FindIterable<Document> documents = mongoOperations
                .getCollection(MongoChatMessageDocument.COLLECTION_NAME)
                .find(filter(options))
                .sort(new Document("roomId", 1)
                        .append("roomSequence", 1))
                .hintString(MongoChatMessageSchemaInitializer
                        .ROOM_SEQUENCE_INDEX_NAME)
                .batchSize(options.batchSize());
        String currentRoomId = null;
        Document latest = null;
        try (MongoCursor<Document> cursor = documents.iterator()) {
            while (cursor.hasNext()) {
                Document document = cursor.next();
                Object rawRoomId = document.get("roomId");
                if (!(rawRoomId instanceof String roomId)
                        || roomId.isBlank()) {
                    visitor.onMalformed(new MalformedCandidate(
                            null,
                            stringValue(document.get("_id")),
                            "missing-or-invalid-roomId"));
                    continue;
                }
                if (currentRoomId != null
                        && !currentRoomId.equals(roomId)) {
                    emit(latest, visitor);
                    latest = null;
                }
                currentRoomId = roomId;
                latest = document;
            }
        }
        if (latest != null) {
            emit(latest, visitor);
        }
    }

    public CandidateRead latest(String roomId) {
        Document document = mongoOperations
                .getCollection(MongoChatMessageDocument.COLLECTION_NAME)
                .find(Filters.eq("roomId", roomId))
                .sort(new Document("roomSequence", -1))
                .hintString(MongoChatMessageSchemaInitializer
                        .ROOM_SEQUENCE_INDEX_NAME)
                .limit(1)
                .first();
        if (document == null) {
            return CandidateRead.missing(roomId);
        }
        return map(document);
    }

    public MessageRead findMessage(String messageId) {
        Document document = mongoOperations
                .getCollection(MongoChatMessageDocument.COLLECTION_NAME)
                .find(Filters.eq("_id", messageId))
                .first();
        if (document == null) {
            return MessageRead.missing(messageId);
        }
        if (!hasExactMessageBsonTypes(document)) {
            return MessageRead.malformed(
                    messageId, "invalid-bson-types");
        }
        try {
            MongoChatMessageDocument mapped = mongoOperations
                    .getConverter()
                    .read(MongoChatMessageDocument.class, document);
            return MessageRead.found(mapped.toDomain());
        } catch (RuntimeException exception) {
            return MessageRead.malformed(
                    messageId,
                    exception.getClass().getSimpleName());
        }
    }

    private void emit(Document document, CandidateVisitor visitor) {
        CandidateRead result = map(document);
        if (result.candidate() != null) {
            visitor.onCandidate(result.candidate());
        } else {
            visitor.onMalformed(result.malformed());
        }
    }

    private CandidateRead map(Document document) {
        String roomId = stringValue(document.get("roomId"));
        String messageId = stringValue(document.get("_id"));
        if (!hasExactMessageBsonTypes(document)) {
            return CandidateRead.malformed(new MalformedCandidate(
                    roomId,
                    messageId,
                    "invalid-bson-types"),
                    document);
        }
        try {
            MongoChatMessageDocument mapped = mongoOperations
                    .getConverter()
                    .read(MongoChatMessageDocument.class, document);
            return CandidateRead.found(
                    RoomInboxSummaryCandidate.from(mapped.toDomain()),
                    document);
        } catch (RuntimeException exception) {
            return CandidateRead.malformed(
                    new MalformedCandidate(
                            roomId,
                            messageId,
                            exception.getClass().getSimpleName()),
                    document);
        }
    }

    private static boolean hasExactMessageBsonTypes(Document document) {
        Object content = document.get("content");
        Object deletedAt = document.get("deletedAt");
        return document.get("_id") instanceof String
                && document.get("schemaVersion") instanceof Integer
                && document.get("roomId") instanceof String
                && document.get("roomSequence") instanceof Long
                && document.get("senderUserId") instanceof String
                && document.get("senderMembershipId") instanceof String
                && document.get("clientMessageId") instanceof String
                && (content == null || content instanceof String)
                && document.get("creationContentFingerprint")
                instanceof String
                && document.get("state") instanceof String
                && document.get("countable") instanceof Boolean
                && document.get("messageVersion") instanceof Long
                && document.get("createdAt") instanceof Date
                && document.get("updatedAt") instanceof Date
                && (deletedAt == null || deletedAt instanceof Date);
    }

    private static Bson filter(
            RoomInboxSummaryMaintenanceOptions options
    ) {
        if (options.roomId() != null) {
            return Filters.eq("roomId", options.roomId());
        }
        if (options.afterRoomId() != null) {
            return Filters.gt("roomId", options.afterRoomId());
        }
        return new Document();
    }

    private static String stringValue(Object value) {
        return value instanceof String text ? text : null;
    }

    public interface CandidateVisitor {

        void onCandidate(RoomInboxSummaryCandidate candidate);

        void onMalformed(MalformedCandidate malformed);
    }

    public record MalformedCandidate(
            String roomId,
            String messageId,
            String reason
    ) {
    }

    public record CandidateRead(
            String roomId,
            RoomInboxSummaryCandidate candidate,
            MalformedCandidate malformed,
            boolean missing,
            Document raw
    ) {

        static CandidateRead found(
                RoomInboxSummaryCandidate candidate,
                Document raw
        ) {
            return new CandidateRead(
                    candidate.source().roomId(),
                    candidate,
                    null,
                    false,
                    new Document(raw));
        }

        static CandidateRead malformed(
                MalformedCandidate malformed,
                Document raw
        ) {
            return new CandidateRead(
                    malformed.roomId(),
                    null,
                    malformed,
                    false,
                    new Document(raw));
        }

        static CandidateRead missing(String roomId) {
            return new CandidateRead(
                    roomId, null, null, true, null);
        }

        public boolean sameSnapshot(CandidateRead other) {
            if (missing || other.missing) {
                return missing && other.missing;
            }
            return Objects.equals(raw, other.raw);
        }
    }

    public record MessageRead(
            String messageId,
            ChatMessage message,
            boolean missing,
            String malformedReason
    ) {

        static MessageRead found(ChatMessage message) {
            return new MessageRead(
                    message.messageId(), message, false, null);
        }

        static MessageRead missing(String messageId) {
            return new MessageRead(messageId, null, true, null);
        }

        static MessageRead malformed(
                String messageId,
                String reason
        ) {
            return new MessageRead(messageId, null, false, reason);
        }
    }
}
