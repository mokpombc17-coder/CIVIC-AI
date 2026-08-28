package com.hamcheeze.chat.room.creation.mongo;

import com.hamcheeze.chat.room.creation.persistence.RoomCreationRequestStore;
import com.hamcheeze.chat.room.category.mongo.MongoRoomCategoryMigration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;

@Configuration(proxyBeanMethods = false)
public class MongoRoomCreationRequestConfiguration {

    @Bean(initMethod = "initialize")
    MongoRoomCreationRequestSchemaInitializer
    mongoRoomCreationRequestSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoRoomCreationRequestSchemaInitializer(
                mongoOperations);
    }

    @Bean
    RoomCreationRequestStore roomCreationRequestStore(
            MongoOperations mongoOperations,
            MongoRoomCreationRequestSchemaInitializer
                    schemaInitializer,
            MongoRoomCategoryMigration categoryMigration
    ) {
        return new MongoRoomCreationRequestStore(mongoOperations);
    }
}
