package com.hamcheeze.chat.message.mongo;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import io.micrometer.core.instrument.MeterRegistry;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxDocument;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxSchemaInitializer;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxStore;
import org.springframework.data.mongodb.MongoTransactionManager;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.mongodb.MongoDBContainer;

import java.time.Clock;
import java.util.function.Supplier;

final class MongoChatMessageStoreTestConfiguration
        implements AutoCloseable {

    private static final String IMAGE = "mongo:7.0.14";
    private static final String DATABASE = "chat_message_store_test";

    private final MongoDBContainer container =
            new MongoDBContainer(IMAGE).withReplicaSet();
    private MongoClient mongoClient;
    private MongoTemplate mongoTemplate;
    private TransactionTemplate transactionTemplate;

    void start() {
        container.start();
        mongoClient = MongoClients.create(
                container.getReplicaSetUrl(DATABASE));
        SimpleMongoClientDatabaseFactory databaseFactory =
                new SimpleMongoClientDatabaseFactory(
                        mongoClient,
                        DATABASE);
        mongoTemplate = new MongoTemplate(databaseFactory);
        transactionTemplate = new TransactionTemplate(
                new MongoTransactionManager(databaseFactory));
    }

    MongoOperations mongoOperations() {
        return mongoTemplate;
    }

    MongoChatMessageSchemaInitializer schemaInitializer() {
        return new MongoChatMessageSchemaInitializer(mongoTemplate);
    }

    MongoChatMessageStore store(
            Clock clock,
            Supplier<String> messageIdGenerator,
            MeterRegistry meterRegistry
    ) {
        return new MongoChatMessageStore(
                mongoTemplate,
                transactionTemplate,
                clock,
                messageIdGenerator,
                new MongoChatMessageExceptionClassifier(),
                new MongoChatMessageOutboxStore(mongoTemplate),
                meterRegistry);
    }

    void resetSchema() {
        if (mongoTemplate.collectionExists(
                MongoChatMessageDocument.COLLECTION_NAME)) {
            mongoTemplate.dropCollection(
                    MongoChatMessageDocument.COLLECTION_NAME);
        }
        if (mongoTemplate.collectionExists(
                MongoRoomSequenceDocument.COLLECTION_NAME)) {
            mongoTemplate.dropCollection(
                    MongoRoomSequenceDocument.COLLECTION_NAME);
        }
        if (mongoTemplate.collectionExists(
                MongoChatMessageOutboxDocument.COLLECTION_NAME)) {
            mongoTemplate.dropCollection(
                    MongoChatMessageOutboxDocument.COLLECTION_NAME);
        }
        schemaInitializer().initialize();
        new MongoChatMessageOutboxSchemaInitializer(
                mongoTemplate).initialize();
    }

    @Override
    public void close() {
        if (mongoClient != null) {
            mongoClient.close();
        }
        container.stop();
    }
}
