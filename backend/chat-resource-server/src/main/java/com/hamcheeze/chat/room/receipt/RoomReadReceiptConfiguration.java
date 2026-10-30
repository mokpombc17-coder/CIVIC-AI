package com.hamcheeze.chat.room.receipt;

import com.hamcheeze.chat.room.inbox.RoomReadPositionResolver;
import com.hamcheeze.chat.room.inbox.RoomReadStateStore;
import com.hamcheeze.chat.room.inbox.RoomSequenceReader;
import com.hamcheeze.chat.room.application.RoomMembershipProperties;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import com.hamcheeze.chat.websocket.config.ChatContentProperties;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(RoomReadReceiptProperties.class)
public class RoomReadReceiptConfiguration {

    @Bean
    RoomReadReceiptStateService roomReadReceiptStateService(
            RoomQueryReader roomReader,
            RoomReadStateStore readStateStore,
            RoomReadPositionResolver positionResolver,
            RoomSequenceReader sequenceReader,
            RoomReadReceiptProperties properties,
            RoomMembershipProperties membershipProperties,
            MeterRegistry meterRegistry
    ) {
        if (properties.getSnapshotMaxPositions()
                < membershipProperties
                .maxActiveMembersPerRoom()) {
            throw new IllegalStateException(
                    "Read Receipt snapshot position limit must cover "
                            + "the active Room member limit");
        }
        return new RoomReadReceiptStateService(
                roomReader,
                readStateStore,
                positionResolver,
                sequenceReader,
                properties,
                Clock.systemUTC(),
                meterRegistry);
    }

    @Bean
    RoomReadReceiptDeliveryPort roomReadReceiptDeliveryPort(
            SimpMessagingTemplate messagingTemplate
    ) {
        return new SimpleBrokerRoomReadReceiptDelivery(
                messagingTemplate);
    }

    @Bean
    RoomReadReceiptBatcher roomReadReceiptBatcher(
            RoomReadReceiptDeliveryPort delivery,
            RoomReadReceiptProperties properties,
            ChatContentProperties contentProperties,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry
    ) {
        if (properties.getMaxEventBytes()
                >= contentProperties.getMaxStompMessageBytes()) {
            throw new IllegalStateException(
                    "Read Receipt max event bytes must be below the "
                            + "STOMP frame limit");
        }
        return new RoomReadReceiptBatcher(
                delivery,
                properties,
                objectMapper,
                Clock.systemUTC(),
                meterRegistry);
    }
}
