package com.hamcheeze.chat.room.inbox.summary.mongo;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.MessageState;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxLastMessage;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummary;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummaryWriter;
import com.hamcheeze.chat.room.inbox.summary.SummaryWriteResult;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.UpdateOptions;
import com.mongodb.client.result.UpdateResult;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.util.List;
import java.util.Objects;

public final class MongoRoomInboxSummaryWriter
        implements RoomInboxSummaryWriter {

    private final MongoOperations mongoOperations;

    public MongoRoomInboxSummaryWriter(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    @Override
    public SummaryWriteResult applyCreated(ChatMessage message) {
        requireState(message, MessageState.ACTIVE);
        RoomInboxLastMessage lastMessage =
                RoomInboxLastMessage.from(message);
        RoomInboxSummary incoming = new RoomInboxSummary(
                message.roomId(),
                lastMessage,
                message.createdAt(),
                message.updatedAt());

        MongoRoomInboxSummaryDocument existing = find(message.roomId());
        if (existing != null
                && existing.lastMessage().roomSequence()
                >= message.roomSequence()) {
            return SummaryWriteResult.UNCHANGED;
        }

        Document shouldReplace = new Document("$or", List.of(
                new Document("$eq", List.of(
                        new Document("$type",
                                "$lastMessage.roomSequence"),
                        "missing")),
                new Document("$lt", List.of(
                        "$lastMessage.roomSequence",
                        message.roomSequence()))));
        Document replacement = MongoRoomInboxSummaryDocument
                .fromDomain(incoming)
                .toBson();
        Document fields = new Document();
        for (String field : List.of(
                "schemaVersion",
                "lastMessage",
                "lastActivityAt",
                "updatedAt")) {
            fields.append(
                    field,
                    new Document("$cond", List.of(
                            shouldReplace,
                            new Document(
                                    "$literal",
                                    replacement.get(field)),
                            "$" + field)));
        }
        UpdateResult result = mongoOperations.execute(
                MongoRoomInboxSummaryDocument.COLLECTION_NAME,
                collection -> collection.updateOne(
                        Filters.eq("_id", message.roomId()),
                        List.of(new Document("$set", fields)),
                        new UpdateOptions().upsert(true)));
        if (result.getUpsertedId() != null) {
            return SummaryWriteResult.CREATED;
        }
        return result.getModifiedCount() == 1
                ? SummaryWriteResult.UPDATED
                : SummaryWriteResult.UNCHANGED;
    }

    @Override
    public SummaryWriteResult applyUpdated(ChatMessage message) {
        requireState(message, MessageState.ACTIVE);
        RoomInboxLastMessage incoming =
                RoomInboxLastMessage.from(message);
        return applyMutation(message, incoming);
    }

    @Override
    public SummaryWriteResult applyDeleted(ChatMessage message) {
        requireState(message, MessageState.DELETED_BY_AUTHOR);
        RoomInboxLastMessage incoming =
                RoomInboxLastMessage.from(message);
        return applyMutation(message, incoming);
    }

    private SummaryWriteResult applyMutation(
            ChatMessage message,
            RoomInboxLastMessage incoming
    ) {
        MongoRoomInboxSummaryDocument existing = find(message.roomId());
        if (existing == null
                || !existing.lastMessage().messageId()
                .equals(message.messageId())
                || existing.lastMessage().roomSequence()
                != message.roomSequence()
                || existing.lastMessage().messageVersion()
                >= message.messageVersion()) {
            return SummaryWriteResult.UNCHANGED;
        }

        Query query = Query.query(new Criteria().andOperator(
                Criteria.where("_id").is(message.roomId()),
                Criteria.where("schemaVersion").is(
                        MongoRoomInboxSummaryDocument
                                .CURRENT_SCHEMA_VERSION),
                Criteria.where("lastMessage.messageId")
                        .is(message.messageId()),
                Criteria.where("lastMessage.roomSequence")
                        .is(message.roomSequence()),
                Criteria.where("lastMessage.messageVersion")
                        .lt(message.messageVersion())));
        Update update = new Update()
                .set("lastMessage.messageVersion",
                        incoming.messageVersion())
                .set("lastMessage.state", incoming.state())
                .set("lastMessage.preview", incoming.preview())
                .set("lastMessage.previewTruncated",
                        incoming.previewTruncated())
                .set("updatedAt", message.updatedAt());
        return mongoOperations.updateFirst(
                        query,
                        update,
                        MongoRoomInboxSummaryDocument.COLLECTION_NAME)
                .getModifiedCount() == 1
                ? SummaryWriteResult.UPDATED
                : SummaryWriteResult.UNCHANGED;
    }

    private MongoRoomInboxSummaryDocument find(String roomId) {
        return mongoOperations.findById(
                roomId,
                MongoRoomInboxSummaryDocument.class,
                MongoRoomInboxSummaryDocument.COLLECTION_NAME);
    }

    private static void requireState(
            ChatMessage message,
            MessageState expected
    ) {
        Objects.requireNonNull(message, "message");
        if (message.state() != expected) {
            throw new IllegalArgumentException(
                    "Expected message state " + expected);
        }
    }
}
