package com.hamcheeze.chat;

import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class ProductionProfileStartupTest {

    @Test
    void productionCannotStartWithoutRoomAuthorizationService() {
        SpringApplication application =
                new SpringApplication(
                        ChatServerApplication.class,
                        ProdJwtTestConfiguration.class);
        application.setLogStartupInfo(false);

        assertThatThrownBy(() -> {
            try (var ignored = application.run(
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
                // The context must not reach this block.
            }
        })
                .hasRootCauseInstanceOf(NoSuchBeanDefinitionException.class)
                .rootCause()
                .hasMessageContaining(
                        RoomAuthorizationService.class.getName());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProdJwtTestConfiguration {

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }
    }
}
