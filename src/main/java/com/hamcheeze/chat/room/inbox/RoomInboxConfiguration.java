package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.message.mongo.MongoChatMessageSchemaInitializer;
import com.hamcheeze.chat.message.mongo.MongoRoomSequenceReader;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomReadStateSchemaInitializer;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomReadStateStore;
import com.hamcheeze.chat.room.inbox.mongo.MongoRoomInboxPageReader;
import com.hamcheeze.chat.room.inbox.mongo.MongoUnreadCountReader;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummarySchemaInitializer;
import com.hamcheeze.chat.room.mongo.MongoRoomSchemaInitializer;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.room.inbox.notification.RoomInboxEventDelivery;
import com.hamcheeze.chat.room.inbox.notification.RoomInboxCurrentSummaryReader;
import com.hamcheeze.chat.room.inbox.notification.RoomInboxNotificationPipeline;
import com.hamcheeze.chat.room.inbox.notification.SimpleBrokerRoomInboxEventDelivery;
import com.hamcheeze.chat.room.inbox.notification.mongo.MongoRoomInboxCurrentSummaryReader;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import com.hamcheeze.chat.websocket.connection.ActiveConnectionRegistry;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import tools.jackson.databind.ObjectMapper;

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
            RoomInboxPageReader pageReader,
            RoomReadStateStore store,
            UnreadCountReader unreadCountReader,
            RoomInboxCursorCodec cursorCodec,
            MeterRegistry meterRegistry
    ) {
        return new RoomInboxService(
                pageReader,
                store,
                unreadCountReader,
                cursorCodec,
                meterRegistry);
    }

    @Bean
    RoomInboxPageReader roomInboxPageReader(
            MongoOperations mongoOperations,
            MongoRoomSchemaInitializer roomSchemaInitializer,
            MongoRoomInboxSummarySchemaInitializer summarySchemaInitializer,
            RoomInboxProperties properties
    ) {
        return new MongoRoomInboxPageReader(
                mongoOperations, properties);
    }

    @Bean
    RoomInboxEventDelivery roomInboxEventDelivery(
            SimpMessagingTemplate messagingTemplate
    ) {
        return new SimpleBrokerRoomInboxEventDelivery(
                messagingTemplate);
    }

    @Bean
    RoomInboxCurrentSummaryReader roomInboxCurrentSummaryReader(
            MongoOperations mongoOperations,
            MongoRoomInboxSummarySchemaInitializer schemaInitializer
    ) {
        return new MongoRoomInboxCurrentSummaryReader(
                mongoOperations);
    }

    @Bean
    RoomInboxNotificationPipeline roomInboxNotificationPipeline(
            RoomQueryReader roomReader,
            RoomInboxCurrentSummaryReader currentSummaryReader,
            ActiveConnectionRegistry activeConnections,
            RoomInboxEventDelivery delivery,
            RoomInboxProperties properties,
            ObjectMapper objectMapper,
            ChatContentProperties contentProperties,
            MeterRegistry meterRegistry
    ) {
        return new RoomInboxNotificationPipeline(
                roomReader,
                currentSummaryReader,
                activeConnections,
                delivery,
                properties,
                objectMapper,
                contentProperties,
                Clock.systemUTC(),
                meterRegistry);
    }
}
