package com.hamcheeze.chat.support;

import com.hamcheeze.chat.message.mongo.MongoChatMessageDocument;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@ResourceLock("mongo-runtime-test")
public abstract class MongoRuntimeIntegrationTest {

    @Autowired
    protected MongoOperations mongoOperations;

    @DynamicPropertySource
    static void registerMongoProperties(
            DynamicPropertyRegistry registry
    ) {
        MongoRuntimeTestContainer.registerMongoProperties(registry);
    }

    @BeforeEach
    void clearMongoRuntimeDocuments() {
        mongoOperations.remove(
                new Query(),
                MongoChatMessageDocument.COLLECTION_NAME);
        mongoOperations.remove(
                new Query(),
                MongoRoomSequenceDocument.COLLECTION_NAME);
    }
}
