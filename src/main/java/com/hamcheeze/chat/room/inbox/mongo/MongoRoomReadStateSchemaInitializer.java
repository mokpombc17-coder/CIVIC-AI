package com.hamcheeze.chat.room.inbox.mongo;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.index.Index;

import java.util.Objects;

public final class MongoRoomReadStateSchemaInitializer {

    public static final String USER_ROOM_INDEX_NAME =
            "uk_chat_room_read_state_user_room";

    private final MongoOperations mongoOperations;

    public MongoRoomReadStateSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        this.mongoOperations = Objects.requireNonNull(
                mongoOperations, "mongoOperations");
    }

    public void initialize() {
        if (!mongoOperations.collectionExists(
                MongoRoomReadStateDocument.COLLECTION_NAME)) {
            mongoOperations.createCollection(
                    MongoRoomReadStateDocument.COLLECTION_NAME);
        }
        mongoOperations.indexOps(
                        MongoRoomReadStateDocument.COLLECTION_NAME)
                .createIndex(new Index()
                        .on("userId", Sort.Direction.ASC)
                        .on("roomId", Sort.Direction.ASC)
                        .named(USER_ROOM_INDEX_NAME)
                        .unique());
    }
}
