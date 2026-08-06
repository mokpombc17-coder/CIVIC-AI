package com.hamcheeze.chat.room.mongo;

import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.PartialIndexFilter;

import java.time.Duration;
import java.util.Objects;

public final class MongoRoomSchemaInitializer {

    public static final String MEMBERSHIP_ROOM_USER_INDEX_NAME =
            "uk_chat_membership_room_user";
    public static final String MEMBERSHIP_ROOM_STATUS_INDEX_NAME =
            "ix_chat_membership_room_status";
    public static final String MEMBERSHIP_USER_STATUS_INDEX_NAME =
            "ix_chat_membership_user_status";
    public static final String
            MEMBERSHIP_USER_STATUS_CURSOR_INDEX_NAME =
            "ix_chat_membership_user_status_cursor";
    public static final String
            MEMBERSHIP_ROOM_STATUS_CURSOR_INDEX_NAME =
            "ix_chat_membership_room_status_cursor";
    public static final String LISTED_ROOM_CURSOR_INDEX_NAME =
            "ix_chat_room_status_visibility_cursor";
    public static final String MEMBERSHIP_OWNER_INDEX_NAME =
            "uk_chat_membership_room_owner";
    public static final String RECEIPT_REQUEST_INDEX_NAME =
            "uk_chat_room_command_receipt_requester_request";
    public static final String RECEIPT_TTL_INDEX_NAME =
            "ttl_chat_room_command_receipt_expires_at";

    private final MongoOperations mongoOperations;

    public MongoRoomSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    public void initialize() {
        ensureCollection(MongoRoomDocument.COLLECTION_NAME);
        ensureCollection(MongoMembershipDocument.COLLECTION_NAME);
        ensureCollection(
                MongoRoomCommandReceiptDocument.COLLECTION_NAME);
        ensureCollection(
                MongoUserActiveRoomQuotaLockDocument.COLLECTION_NAME);

        mongoOperations
                .indexOps(MongoRoomDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("status", Sort.Direction.ASC)
                        .on("visibility", Sort.Direction.ASC)
                        .on("_id", Sort.Direction.ASC)
                        .named(LISTED_ROOM_CURSOR_INDEX_NAME));

        mongoOperations
                .indexOps(MongoMembershipDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .on("userId", Sort.Direction.ASC)
                        .named(MEMBERSHIP_ROOM_USER_INDEX_NAME)
                        .unique());
        mongoOperations
                .indexOps(MongoMembershipDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .named(MEMBERSHIP_ROOM_STATUS_INDEX_NAME));
        mongoOperations
                .indexOps(MongoMembershipDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("userId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .named(MEMBERSHIP_USER_STATUS_INDEX_NAME));
        mongoOperations
                .indexOps(MongoMembershipDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("userId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("_id", Sort.Direction.ASC)
                        .named(
                                MEMBERSHIP_USER_STATUS_CURSOR_INDEX_NAME));
        mongoOperations
                .indexOps(MongoMembershipDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("_id", Sort.Direction.ASC)
                        .named(
                                MEMBERSHIP_ROOM_STATUS_CURSOR_INDEX_NAME));
        mongoOperations
                .indexOps(MongoMembershipDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .named(MEMBERSHIP_OWNER_INDEX_NAME)
                        .unique()
                        .partial(PartialIndexFilter.of(
                                new Document(
                                        "role",
                                        "OWNER"))));

        mongoOperations
                .indexOps(
                        MongoRoomCommandReceiptDocument
                                .COLLECTION_NAME)
                .createIndex(new Index()
                        .on("requesterUserId", Sort.Direction.ASC)
                        .on("clientRequestId", Sort.Direction.ASC)
                        .named(RECEIPT_REQUEST_INDEX_NAME)
                        .unique());
        mongoOperations
                .indexOps(
                        MongoRoomCommandReceiptDocument
                                .COLLECTION_NAME)
                .createIndex(new Index()
                        .on("expiresAt", Sort.Direction.ASC)
                        .named(RECEIPT_TTL_INDEX_NAME)
                        .expire(Duration.ZERO));
    }

    private void ensureCollection(String collectionName) {
        if (!mongoOperations.collectionExists(collectionName)) {
            mongoOperations.createCollection(collectionName);
        }
    }
}
