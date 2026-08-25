package com.hamcheeze.chat.room.creation.mongo;

import com.hamcheeze.chat.room.creation.RoomCreationRequestStatus;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.PartialIndexFilter;

import java.util.Objects;

public final class MongoRoomCreationRequestSchemaInitializer {

    public static final String REQUESTER_CLIENT_REQUEST_INDEX_NAME =
            "uk_chat_room_creation_request_requester_client";
    public static final String PENDING_SLOT_INDEX_NAME =
            "uk_chat_room_creation_request_pending_slot";
    public static final String STATUS_CURSOR_INDEX_NAME =
            "ix_chat_room_creation_request_status_cursor";
    public static final String REQUESTER_CURSOR_INDEX_NAME =
            "ix_chat_room_creation_request_requester_cursor";

    private final MongoOperations mongoOperations;

    public MongoRoomCreationRequestSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    public void initialize() {
        String collection =
                MongoRoomCreationRequestDocument.COLLECTION_NAME;
        if (!mongoOperations.collectionExists(collection)) {
            mongoOperations.createCollection(collection);
        }
        mongoOperations.indexOps(collection).createIndex(
                new Index()
                        .on("requesterUserId", Sort.Direction.ASC)
                        .on("clientRequestId", Sort.Direction.ASC)
                        .named(REQUESTER_CLIENT_REQUEST_INDEX_NAME)
                        .unique());
        mongoOperations.indexOps(collection).createIndex(
                new Index()
                        .on("requesterUserId", Sort.Direction.ASC)
                        .on("pendingSlot", Sort.Direction.ASC)
                        .named(PENDING_SLOT_INDEX_NAME)
                        .unique()
                        .partial(PartialIndexFilter.of(
                                new Document(
                                        "status",
                                        RoomCreationRequestStatus
                                                .PENDING.name()))));
        mongoOperations.indexOps(collection).createIndex(
                new Index()
                        .on("status", Sort.Direction.ASC)
                        .on("requestedAt", Sort.Direction.ASC)
                        .on("_id", Sort.Direction.ASC)
                        .named(STATUS_CURSOR_INDEX_NAME));
        mongoOperations.indexOps(collection).createIndex(
                new Index()
                        .on("requesterUserId", Sort.Direction.ASC)
                        .on("requestedAt", Sort.Direction.ASC)
                        .on("_id", Sort.Direction.ASC)
                        .named(REQUESTER_CURSOR_INDEX_NAME));
    }

}
