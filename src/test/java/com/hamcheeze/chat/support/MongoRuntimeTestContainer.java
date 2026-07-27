package com.hamcheeze.chat.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.mongodb.MongoDBContainer;

public final class MongoRuntimeTestContainer {

    private static final String IMAGE = "mongo:7.0.14";
    private static final String DATABASE = "chat_runtime_test";
    private static final MongoDBContainer CONTAINER =
            new MongoDBContainer(IMAGE).withReplicaSet();

    static {
        CONTAINER.start();
    }

    private MongoRuntimeTestContainer() {
    }

    public static void registerMongoProperties(
            DynamicPropertyRegistry registry
    ) {
        registry.add(
                "spring.mongodb.uri",
                MongoRuntimeTestContainer::replicaSetUrl);
    }

    public static String replicaSetUrl() {
        return CONTAINER.getReplicaSetUrl(DATABASE);
    }
}
