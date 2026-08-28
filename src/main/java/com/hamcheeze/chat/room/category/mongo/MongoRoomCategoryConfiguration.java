package com.hamcheeze.chat.room.category.mongo;

import com.hamcheeze.chat.room.category.RoomCategorySeedInitializer;
import com.hamcheeze.chat.room.category.persistence.RoomCategoryStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Clock;

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

    @Bean(initMethod = "initialize")
    RoomCategorySeedInitializer roomCategorySeedInitializer(
            RoomCategoryStore store
    ) {
        return new RoomCategorySeedInitializer(
                store,
                Clock.systemUTC());
    }
}
