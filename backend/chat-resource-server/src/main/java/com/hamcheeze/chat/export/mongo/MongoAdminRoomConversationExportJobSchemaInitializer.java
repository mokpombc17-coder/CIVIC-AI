package com.hamcheeze.chat.export.mongo;

import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.PartialIndexFilter;

import java.util.Objects;

public final class MongoAdminRoomConversationExportJobSchemaInitializer {

    public static final String RUNNING_ROOM_INDEX_NAME =
            "uk_chat_admin_conversation_export_running_room";

    private final MongoOperations mongoOperations;

    public MongoAdminRoomConversationExportJobSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    public void initialize() {
        if (!mongoOperations.collectionExists(
                MongoAdminRoomConversationExportJobDocument.COLLECTION_NAME)) {
            mongoOperations.createCollection(
                    MongoAdminRoomConversationExportJobDocument
                            .COLLECTION_NAME);
        }
        mongoOperations
                .indexOps(MongoAdminRoomConversationExportJobDocument
                        .COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .named(RUNNING_ROOM_INDEX_NAME)
                        .unique()
                        .partial(PartialIndexFilter.of(
                                new Document("status", "RUNNING"))));
    }
}
