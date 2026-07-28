package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;

@Configuration(proxyBeanMethods = false)
public class MongoRoomPersistenceConfiguration {

    @Bean(initMethod = "initialize")
    MongoRoomSchemaInitializer mongoRoomSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoRoomSchemaInitializer(mongoOperations);
    }

    @Bean
    RoomStore roomStore(
            MongoOperations mongoOperations,
            MongoRoomSchemaInitializer schemaInitializer
    ) {
        return new MongoRoomStore(mongoOperations);
    }

    @Bean
    MembershipStore membershipStore(
            MongoOperations mongoOperations,
            MongoRoomSchemaInitializer schemaInitializer
    ) {
        return new MongoMembershipStore(mongoOperations);
    }

    @Bean
    RoomCommandReceiptStore roomCommandReceiptStore(
            MongoOperations mongoOperations,
            MongoRoomSchemaInitializer schemaInitializer
    ) {
        return new MongoRoomCommandReceiptStore(mongoOperations);
    }

    @Bean
    RoomQueryReader roomQueryReader(
            MongoOperations mongoOperations,
            MongoRoomSchemaInitializer schemaInitializer
    ) {
        return new MongoRoomQueryReader(mongoOperations);
    }
}
