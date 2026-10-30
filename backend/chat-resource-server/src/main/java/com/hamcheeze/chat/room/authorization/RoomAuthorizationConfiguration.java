package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.room.persistence.RoomParticipationStore;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(RoomAuthorizationProperties.class)
public class RoomAuthorizationConfiguration {

    @Bean
    RoomAuthorizationService roomAuthorizationService(
            RoomAccessReader accessReader,
            RoomParticipationStore participationStore,
            MeterRegistry meterRegistry
    ) {
        return new MembershipRoomAuthorizationService(
                accessReader,
                participationStore,
                meterRegistry);
    }
}
