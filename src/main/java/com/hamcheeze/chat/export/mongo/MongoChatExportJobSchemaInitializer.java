package com.hamcheeze.chat.export.mongo;

import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.PartialIndexFilter;

import java.util.Objects;

public final class MongoChatExportJobSchemaInitializer {

    public static final String RUNNING_ROOM_INDEX_NAME =
            "uk_chat_export_running_room";
    public static final String LATEST_SUCCEEDED_INDEX_NAME =
            "ix_chat_export_latest_succeeded";

    private final MongoOperations mongoOperations;

    public MongoChatExportJobSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    public void initialize() {
        if (!mongoOperations.collectionExists(
                MongoChatExportJobDocument.COLLECTION_NAME)) {
            mongoOperations.createCollection(
                    MongoChatExportJobDocument.COLLECTION_NAME);
        }
        mongoOperations
                .indexOps(MongoChatExportJobDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .named(RUNNING_ROOM_INDEX_NAME)
                        .unique()
                        .partial(PartialIndexFilter.of(
                                new Document("status", "RUNNING"))));
        mongoOperations
                .indexOps(MongoChatExportJobDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("roomId", Sort.Direction.ASC)
                        .on("requestedByAdminId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("toChangeSequenceInclusive", Sort.Direction.DESC)
                        .on("completedAt", Sort.Direction.DESC)
                        .named(LATEST_SUCCEEDED_INDEX_NAME));
    }
}
