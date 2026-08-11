package com.hamcheeze.chat.message.mongo;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import io.micrometer.core.instrument.MeterRegistry;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxDocument;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxSchemaInitializer;
import com.hamcheeze.chat.message.outbox.mongo.MongoChatMessageOutboxStore;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
import com.hamcheeze.chat.message.ChatMessageMutationStore;
import com.hamcheeze.chat.message.audit.ChatMessageAuditWriter;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditEventDocument;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditSchemaInitializer;
import com.hamcheeze.chat.message.audit.mongo.MongoChatMessageAuditStore;
import com.hamcheeze.chat.message.audit.mongo.MongoRoomMessageAuditSequenceDocument;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummaryWriter;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryDocument;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummarySchemaInitializer;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryWriter;
import org.springframework.data.mongodb.MongoTransactionManager;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.transaction.support.TransactionOperations;
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

    TransactionOperations transactionOperations() {
        return transactionTemplate;
    }

    MongoChatMessageSchemaInitializer schemaInitializer() {
        return new MongoChatMessageSchemaInitializer(mongoTemplate);
    }

    MongoRoomInboxSummarySchemaInitializer summarySchemaInitializer() {
        return new MongoRoomInboxSummarySchemaInitializer(mongoTemplate);
    }

    RoomInboxSummaryWriter summaryWriter() {
        return new MongoRoomInboxSummaryWriter(mongoTemplate);
    }

    ChatMessageAuditWriter auditWriter(MeterRegistry meterRegistry) {
        return new MongoChatMessageAuditStore(
                mongoTemplate,
                meterRegistry);
    }

    MongoChatMessageStore store(
            Clock clock,
            Supplier<String> messageIdGenerator,
            MeterRegistry meterRegistry
    ) {
        return store(
                clock,
                messageIdGenerator,
                summaryWriter(),
                meterRegistry);
    }

    MongoChatMessageStore store(
            Clock clock,
            Supplier<String> messageIdGenerator,
            RoomInboxSummaryWriter summaryWriter,
            MeterRegistry meterRegistry
    ) {
        return store(
                clock,
                messageIdGenerator,
                auditWriter(meterRegistry),
                summaryWriter,
                meterRegistry);
    }

    MongoChatMessageStore store(
            Clock clock,
            Supplier<String> messageIdGenerator,
            ChatMessageAuditWriter auditWriter,
            RoomInboxSummaryWriter summaryWriter,
            MeterRegistry meterRegistry
    ) {
        return new MongoChatMessageStore(
                mongoTemplate,
                transactionTemplate,
                clock,
                messageIdGenerator,
                new MongoChatMessageExceptionClassifier(),
                auditWriter,
                new MongoChatMessageOutboxStore(mongoTemplate),
                summaryWriter,
                meterRegistry);
    }

    ChatMessageMutationStore mutationStore(
            Clock clock,
            ChatMessageOutboxWriter outboxWriter,
            MeterRegistry meterRegistry
    ) {
        return mutationStore(
                clock,
                outboxWriter,
                summaryWriter(),
                meterRegistry);
    }

    ChatMessageMutationStore mutationStore(
            Clock clock,
            ChatMessageOutboxWriter outboxWriter,
            RoomInboxSummaryWriter summaryWriter,
            MeterRegistry meterRegistry
    ) {
        return mutationStore(
                clock,
                outboxWriter,
                auditWriter(meterRegistry),
                summaryWriter,
                meterRegistry);
    }

    ChatMessageMutationStore mutationStore(
            Clock clock,
            ChatMessageOutboxWriter outboxWriter,
            ChatMessageAuditWriter auditWriter,
            RoomInboxSummaryWriter summaryWriter,
            MeterRegistry meterRegistry
    ) {
        return new MongoChatMessageMutationStore(
                mongoTemplate,
                transactionTemplate,
                clock,
                new MongoChatMessageExceptionClassifier(),
                auditWriter,
                outboxWriter,
                summaryWriter,
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
        if (mongoTemplate.collectionExists(
                MongoChatMessageMutationReceiptDocument
                        .COLLECTION_NAME)) {
            mongoTemplate.dropCollection(
                    MongoChatMessageMutationReceiptDocument
                            .COLLECTION_NAME);
        }
        if (mongoTemplate.collectionExists(
                MongoRoomInboxSummaryDocument.COLLECTION_NAME)) {
            mongoTemplate.dropCollection(
                    MongoRoomInboxSummaryDocument.COLLECTION_NAME);
        }
        if (mongoTemplate.collectionExists(
                MongoChatMessageAuditEventDocument.COLLECTION_NAME)) {
            mongoTemplate.dropCollection(
                    MongoChatMessageAuditEventDocument.COLLECTION_NAME);
        }
        if (mongoTemplate.collectionExists(
                MongoRoomMessageAuditSequenceDocument.COLLECTION_NAME)) {
            mongoTemplate.dropCollection(
                    MongoRoomMessageAuditSequenceDocument.COLLECTION_NAME);
        }
        schemaInitializer().initialize();
        new MongoChatMessageAuditSchemaInitializer(
                mongoTemplate).initialize();
        summarySchemaInitializer().initialize();
        new MongoChatMessageMutationSchemaInitializer(
                mongoTemplate).initialize();
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
