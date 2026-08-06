package com.hamcheeze.chat.room.mongo;

import com.hamcheeze.chat.room.application.ActiveRoomMembershipQuotaGuard;
import com.hamcheeze.chat.room.application.RoomMembershipProperties;
import com.hamcheeze.chat.room.persistence.MembershipStore;
import com.hamcheeze.chat.room.persistence.RoomCommandReceiptStore;
import com.hamcheeze.chat.room.persistence.RoomStore;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.authorization.RoomAuthorizationProperties;
import com.hamcheeze.chat.room.query.RoomQueryProperties;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(RoomQueryProperties.class)
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
    ActiveRoomMembershipQuotaGuard
    activeRoomMembershipQuotaGuard(
            MongoOperations mongoOperations,
            MongoRoomSchemaInitializer schemaInitializer,
            RoomMembershipProperties properties
    ) {
        return new MongoActiveRoomMembershipQuotaGuard(
                mongoOperations,
                properties.activeRoomCountQueryMaxTime());
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
            MongoRoomSchemaInitializer schemaInitializer,
            RoomQueryProperties properties
    ) {
        return new MongoRoomQueryReader(
                mongoOperations,
                properties.listedRoomPageQueryMaxTime());
    }

    @Bean
    RoomAccessReader roomAccessReader(
            MongoOperations mongoOperations,
            MongoRoomSchemaInitializer schemaInitializer,
            RoomAuthorizationProperties properties
    ) {
        return new MongoRoomAccessReader(
                mongoOperations,
                properties);
    }
}
