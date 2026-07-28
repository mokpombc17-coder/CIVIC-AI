package com.hamcheeze.chat.room.authorization;

import com.hamcheeze.chat.application.RoomAuthorizationService;
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
            MeterRegistry meterRegistry
    ) {
        return new MembershipRoomAuthorizationService(
                accessReader,
                meterRegistry);
    }
}
