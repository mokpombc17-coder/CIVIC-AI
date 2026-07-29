package com.hamcheeze.chat;

import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.room.application.RoomCommandPostCommitCoordinator;
import com.hamcheeze.chat.room.application.event.RoomCommandEventPropagationCoordinator;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryPort;
import com.hamcheeze.chat.room.authorization.MembershipRoomAuthorizationService;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.delivery.SimpleBrokerRoomEventDeliveryAdapter;
import com.hamcheeze.chat.room.mongo.MongoRoomAccessReader;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class ProductionProfileStartupTest {

    @Test
    void productionStartsWithMembershipRoomAuthorizationService() {
        SpringApplication application =
                new SpringApplication(
                        ChatServerApplication.class,
                        ProdJwtTestConfiguration.class);
        application.setLogStartupInfo(false);

        try (var context = application.run(
                "--spring.profiles.active=prod",
                "--server.port=0",
                "--spring.main.banner-mode=off",
                "--spring.mongodb.uri="
                        + MongoRuntimeTestContainer.replicaSetUrl(),
                "--spring.security.oauth2.resourceserver.jwt.issuer-uri="
                        + "https://issuer.example",
                "--spring.security.oauth2.resourceserver.jwt.audiences[0]="
                        + "chat-server",
                "--chat.websocket.allowed-origins[0]="
                        + "https://chat.example")) {
            assertThat(context.getBeansOfType(
                    RoomAuthorizationService.class))
                    .hasSize(1)
                    .allSatisfy((name, service) ->
                            assertThat(service).isInstanceOf(
                                    MembershipRoomAuthorizationService.class));
            assertThat(context.getBeansOfType(RoomAccessReader.class))
                    .hasSize(1)
                    .allSatisfy((name, reader) ->
                            assertThat(reader).isInstanceOf(
                                    MongoRoomAccessReader.class));
            assertThat(context.getBeansOfType(
                    RoomCommandPostCommitCoordinator.class))
                    .hasSize(1);
            assertThat(context.getBeansOfType(
                    RoomCommandEventPropagationCoordinator.class))
                    .hasSize(1);
            assertThat(context.getBeansOfType(
                    RoomEventDeliveryPort.class))
                    .hasSize(1)
                    .allSatisfy((name, delivery) ->
                            assertThat(delivery).isInstanceOf(
                                    SimpleBrokerRoomEventDeliveryAdapter.class));
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProdJwtTestConfiguration {

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }
    }
}
