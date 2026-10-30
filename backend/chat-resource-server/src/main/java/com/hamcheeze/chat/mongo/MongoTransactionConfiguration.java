package com.hamcheeze.chat.mongo;

import com.mongodb.ReadConcern;
import com.mongodb.ReadPreference;
import com.mongodb.TransactionOptions;
import com.mongodb.WriteConcern;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.MongoTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration(proxyBeanMethods = false)
public class MongoTransactionConfiguration {

    @Bean(name = {
            "mongoTransactionOptions",
            "chatMessageMongoTransactionOptions"
    })
    TransactionOptions mongoTransactionOptions() {
        return TransactionOptions.builder()
                .readConcern(ReadConcern.SNAPSHOT)
                .writeConcern(WriteConcern.MAJORITY)
                .readPreference(ReadPreference.primary())
                .build();
    }

    @Bean
    MongoTransactionManager mongoTransactionManager(
            MongoDatabaseFactory databaseFactory,
            @Qualifier("mongoTransactionOptions")
            TransactionOptions transactionOptions
    ) {
        return new MongoTransactionManager(
                databaseFactory,
                transactionOptions);
    }

    @Bean(name = "mongoTransactionTemplate")
    TransactionTemplate mongoTransactionTemplate(
            MongoTransactionManager transactionManager
    ) {
        return new TransactionTemplate(transactionManager);
    }
}
