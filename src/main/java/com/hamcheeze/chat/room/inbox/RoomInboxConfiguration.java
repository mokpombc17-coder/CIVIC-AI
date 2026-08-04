package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.message.mongo.MongoChatMessageSchemaInitializer;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceReader;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomReadStateSchemaInitializer;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomReadStateStore;
import com.hamcheeze.chat.room.inbox.mongo.MongoUnreadCountReader;
import com.hamcheeze.chat.room.query.RoomQueryCursorCodec;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.room.inbox.notification.RoomInboxEventDelivery;
import com.hamcheeze.chat.room.inbox.notification.RoomInboxNotificationPipeline;
import com.hamcheeze.chat.room.inbox.notification.SimpleBrokerRoomInboxEventDelivery;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(RoomInboxProperties.class)
public class RoomInboxConfiguration {

    @Bean(initMethod = "initialize")
    MongoRoomReadStateSchemaInitializer
    mongoRoomReadStateSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoRoomReadStateSchemaInitializer(
                mongoOperations);
    }

    @Bean
    RoomReadStateStore roomReadStateStore(
            MongoOperations mongoOperations,
            MongoRoomReadStateSchemaInitializer schemaInitializer
    ) {
        return new MongoRoomReadStateStore(mongoOperations);
    }

    @Bean
    RoomSequenceReader roomSequenceReader(
            MongoOperations mongoOperations,
            MongoChatMessageSchemaInitializer schemaInitializer
    ) {
        return new MongoRoomSequenceReader(mongoOperations);
    }

    @Bean
    UnreadCountReader unreadCountReader(
            MongoOperations mongoOperations,
            MongoChatMessageSchemaInitializer schemaInitializer,
            RoomInboxProperties properties,
            MeterRegistry meterRegistry
    ) {
        return new MongoUnreadCountReader(
                mongoOperations, properties, meterRegistry);
    }

    @Bean
    RoomReadStateService roomReadStateService(
            RoomQueryReader roomReader,
            RoomReadStateStore store,
            RoomSequenceReader sequenceReader,
            MeterRegistry meterRegistry
    ) {
        return new RoomReadStateService(
                roomReader,
                store,
                sequenceReader,
                Clock.systemUTC(),
                meterRegistry);
    }

    @Bean
    RoomInboxService roomInboxService(
            RoomQueryReader roomReader,
            RoomReadStateStore store,
            UnreadCountReader unreadCountReader,
            RoomQueryCursorCodec cursorCodec,
            MeterRegistry meterRegistry
    ) {
        return new RoomInboxService(
                roomReader,
                store,
                unreadCountReader,
                cursorCodec,
                meterRegistry);
    }

    @Bean
    RoomInboxEventDelivery roomInboxEventDelivery(
            SimpMessagingTemplate messagingTemplate
    ) {
        return new SimpleBrokerRoomInboxEventDelivery(
                messagingTemplate);
    }

    @Bean
    RoomInboxNotificationPipeline roomInboxNotificationPipeline(
            RoomQueryReader roomReader,
            ActiveConnectionRegistry activeConnections,
            RoomInboxEventDelivery delivery,
            RoomInboxProperties properties,
            MeterRegistry meterRegistry
    ) {
        return new RoomInboxNotificationPipeline(
                roomReader,
                activeConnections,
                delivery,
                properties,
                Clock.systemUTC(),
                meterRegistry);
    }
}
