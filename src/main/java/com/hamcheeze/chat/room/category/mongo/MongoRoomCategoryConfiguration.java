package com.hamcheeze.chat.room.category.mongo;

import com.hamcheeze.chat.room.category.RoomCategorySeedInitializer;
import com.hamcheeze.chat.room.category.RoomCategoryService;
import com.hamcheeze.chat.room.category.persistence.RoomCategoryStore;
import com.hamcheeze.chat.room.category.persistence.RoomCategoryUsage;
import com.hamcheeze.chat.room.mongo.MongoRoomSchemaInitializer;
import com.hamcheeze.chat.room.persistence.RoomStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.util.UUID;

@Configuration(proxyBeanMethods = false)
public class MongoRoomCategoryConfiguration {

    @Bean(initMethod = "initialize")
    MongoRoomCategorySchemaInitializer
    mongoRoomCategorySchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoRoomCategorySchemaInitializer(
                mongoOperations);
    }

    @Bean
    RoomCategoryStore roomCategoryStore(
            MongoOperations mongoOperations,
            MongoRoomCategorySchemaInitializer schemaInitializer
    ) {
        return new MongoRoomCategoryStore(mongoOperations);
    }

    @Bean
    RoomCategoryUsage roomCategoryUsage(
            MongoOperations mongoOperations
    ) {
        return new MongoRoomCategoryUsage(mongoOperations);
    }

    @Bean
    RoomCategoryService roomCategoryService(
            RoomCategoryStore store,
            RoomStore roomStore,
            RoomCategoryUsage usage,
            @Qualifier("mongoTransactionTemplate")
            TransactionOperations transactions
    ) {
        return new RoomCategoryService(
                store,
                roomStore,
                usage,
                transactions,
                Clock.systemUTC(),
                () -> UUID.randomUUID().toString());
    }

    @Bean(initMethod = "initialize")
    RoomCategorySeedInitializer roomCategorySeedInitializer(
            RoomCategoryStore store
    ) {
        return new RoomCategorySeedInitializer(
                store,
                Clock.systemUTC());
    }

    @Bean(initMethod = "initialize")
    MongoRoomCategoryMigration mongoRoomCategoryMigration(
            MongoOperations mongoOperations,
            RoomCategoryStore store,
            MongoRoomSchemaInitializer roomSchemaInitializer,
            RoomCategorySeedInitializer seedInitializer
    ) {
        return new MongoRoomCategoryMigration(
                mongoOperations,
                store,
                Clock.systemUTC());
    }
}
