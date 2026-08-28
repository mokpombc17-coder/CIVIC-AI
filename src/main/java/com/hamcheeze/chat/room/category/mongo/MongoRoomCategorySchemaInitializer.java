package com.hamcheeze.chat.room.category.mongo;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;

import java.util.Objects;

public final class MongoRoomCategorySchemaInitializer {

    public static final String NORMALIZED_NAME_INDEX_NAME =
            "uk_chat_room_category_normalized_name";

    private final MongoOperations mongoOperations;

    public MongoRoomCategorySchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations,
                "mongoOperations");
    }

    public void initialize() {
        String collection = MongoRoomCategoryDocument.COLLECTION_NAME;
        if (!mongoOperations.collectionExists(collection)) {
            mongoOperations.createCollection(collection);
        }
        mongoOperations.indexOps(collection).createIndex(
                new Index()
                        .on("normalizedName", Sort.Direction.ASC)
                        .named(NORMALIZED_NAME_INDEX_NAME)
                        .unique());
    }
}
