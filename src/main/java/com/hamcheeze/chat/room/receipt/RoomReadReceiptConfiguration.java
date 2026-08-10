package com.hamcheeze.chat.room.receipt;

import com.hamcheeze.chat.room.inbox.RoomReadPositionResolver;
import com.hamcheeze.chat.room.inbox.RoomReadStateStore;
import com.hamcheeze.chat.room.inbox.RoomSequenceReader;
import com.hamcheeze.chat.room.query.RoomQueryReader;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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
            MeterRegistry meterRegistry
    ) {
        return new RoomReadReceiptStateService(
                roomReader,
                readStateStore,
                positionResolver,
                sequenceReader,
                properties,
                Clock.systemUTC(),
                meterRegistry);
    }
}
