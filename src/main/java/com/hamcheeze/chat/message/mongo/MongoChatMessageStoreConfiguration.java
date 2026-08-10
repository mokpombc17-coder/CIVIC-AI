package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.ChatMessageMutationStore;
import com.hamcheeze.chat.message.query.ChatMessageHistoryReader;
import com.hamcheeze.chat.message.search.ChatMessageSearchReader;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxWriter;
import com.hamcheeze.chat.room.application.RoomMessageBoundaryPort;
import com.hamcheeze.chat.room.inbox.summary.RoomInboxSummaryWriter;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummarySchemaInitializer;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummaryWriter;
import com.mongodb.client.MongoClient;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.mongodb.health.MongoHealthIndicator;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.UUID;

@Configuration(proxyBeanMethods = false)
public class MongoChatMessageStoreConfiguration {

    @Bean
    MongoChatMessageExceptionClassifier
    mongoChatMessageExceptionClassifier() {
        return new MongoChatMessageExceptionClassifier();
    }

    @Bean(name = {"mongodb", "mongoHealthContributor"})
    MongoHealthIndicator mongodbHealthContributor(
            MongoClient mongoClient
    ) {
        return new MongoHealthIndicator(mongoClient);
    }

    @Bean(initMethod = "initialize")
    MongoChatMessageSchemaInitializer
    mongoChatMessageSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoChatMessageSchemaInitializer(
                mongoOperations);
    }

    @Bean(initMethod = "initialize")
    MongoRoomInboxSummarySchemaInitializer
    mongoRoomInboxSummarySchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoRoomInboxSummarySchemaInitializer(
                mongoOperations);
    }

    @Bean
    RoomInboxSummaryWriter roomInboxSummaryWriter(
            MongoOperations mongoOperations,
            MongoRoomInboxSummarySchemaInitializer schemaInitializer
    ) {
        return new MongoRoomInboxSummaryWriter(mongoOperations);
    }

    @Bean(name = "chatMessageStore")
    ChatMessageStore chatMessageStore(
            MongoOperations mongoOperations,
            @Qualifier("mongoTransactionTemplate")
            TransactionTemplate transactionTemplate,
            MongoChatMessageSchemaInitializer schemaInitializer,
            MongoChatMessageExceptionClassifier exceptionClassifier,
            ChatMessageOutboxWriter outboxWriter,
            RoomInboxSummaryWriter summaryWriter,
            MeterRegistry meterRegistry
    ) {
        return new MongoChatMessageStore(
                mongoOperations,
                transactionTemplate,
                Clock.systemUTC(),
                () -> UUID.randomUUID().toString(),
                exceptionClassifier,
                outboxWriter,
                summaryWriter,
                meterRegistry);
    }

    @Bean(initMethod = "initialize")
    MongoChatMessageMutationSchemaInitializer
    mongoChatMessageMutationSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoChatMessageMutationSchemaInitializer(
                mongoOperations);
    }

    @Bean
    ChatMessageMutationStore chatMessageMutationStore(
            MongoOperations mongoOperations,
            @Qualifier("mongoTransactionTemplate")
            TransactionTemplate transactionTemplate,
            MongoChatMessageMutationSchemaInitializer schemaInitializer,
            MongoChatMessageExceptionClassifier exceptionClassifier,
            ChatMessageOutboxWriter outboxWriter,
            RoomInboxSummaryWriter summaryWriter,
            MeterRegistry meterRegistry
    ) {
        return new MongoChatMessageMutationStore(
                mongoOperations,
                transactionTemplate,
                Clock.systemUTC(),
                exceptionClassifier,
                outboxWriter,
                summaryWriter,
                meterRegistry);
    }

    @Bean
    RoomMessageBoundaryPort roomMessageBoundaryPort(
            MongoOperations mongoOperations,
            MongoChatMessageSchemaInitializer schemaInitializer
    ) {
        return new MongoRoomMessageBoundaryAdapter(mongoOperations);
    }

    @Bean
    ChatMessageHistoryReader chatMessageHistoryReader(
            MongoOperations mongoOperations,
            MongoChatMessageSchemaInitializer schemaInitializer
    ) {
        return new MongoChatMessageHistoryReader(mongoOperations);
    }

    @Bean
    ChatMessageSearchReader chatMessageSearchReader(
            MongoOperations mongoOperations,
            MongoChatMessageSchemaInitializer schemaInitializer
    ) {
        return new MongoChatMessageSearchReader(mongoOperations);
    }
}
