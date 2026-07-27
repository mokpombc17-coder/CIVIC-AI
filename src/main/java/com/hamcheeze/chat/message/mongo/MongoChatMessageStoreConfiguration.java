package com.hamcheeze.chat.message.mongo;

import com.hamcheeze.chat.message.ChatMessageStore;
import com.mongodb.client.MongoClient;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.mongodb.health.MongoHealthIndicator;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.MongoTransactionManager;
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

    @Bean
    MongoTransactionManager mongoTransactionManager(
            MongoDatabaseFactory databaseFactory
    ) {
        return new MongoTransactionManager(databaseFactory);
    }

    @Bean(name = "mongoTransactionTemplate")
    TransactionTemplate mongoTransactionTemplate(
            MongoTransactionManager transactionManager
    ) {
        return new TransactionTemplate(transactionManager);
    }

    @Bean(initMethod = "initialize")
    MongoChatMessageSchemaInitializer
    mongoChatMessageSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoChatMessageSchemaInitializer(
                mongoOperations);
    }

    @Bean(name = "chatMessageStore")
    ChatMessageStore chatMessageStore(
            MongoOperations mongoOperations,
            @Qualifier("mongoTransactionTemplate")
            TransactionTemplate transactionTemplate,
            MongoChatMessageSchemaInitializer schemaInitializer,
            MongoChatMessageExceptionClassifier exceptionClassifier,
            MeterRegistry meterRegistry
    ) {
        return new MongoChatMessageStore(
                mongoOperations,
                transactionTemplate,
                Clock.systemUTC(),
                () -> UUID.randomUUID().toString(),
                exceptionClassifier,
                meterRegistry);
    }
}
