package com.hamcheeze.chat;

import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.room.application.RoomCommandPostCommitCoordinator;
import com.hamcheeze.chat.room.creation.RoomCreationMode;
import com.hamcheeze.chat.room.creation.RoomCreationProperties;
import com.hamcheeze.chat.room.application.event.RoomCommandEventPropagationCoordinator;
import com.hamcheeze.chat.room.application.event.RoomEventDeliveryPort;
import com.hamcheeze.chat.room.authorization.MembershipRoomAuthorizationService;
import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.delivery.SimpleBrokerRoomEventDeliveryAdapter;
import com.hamcheeze.chat.security.CookieOrHeaderBearerTokenResolver;
import com.hamcheeze.chat.room.mongo.MongoRoomAccessReader;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

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
                "--chat.websocket.allowed-origins[0]="
                        + "https://app.example")) {
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
            RoomCreationProperties creationProperties =
                    context.getBean(RoomCreationProperties.class);
            assertThat(creationProperties.mode()).isEqualTo(
                    RoomCreationMode.APPROVAL_REQUIRED);
            assertThat(creationProperties
                    .maxPendingRequestsPerUser()).isEqualTo(3);
            assertThat(context.getBeansOfType(
                    RoomCommandEventPropagationCoordinator.class))
                    .hasSize(1);
            assertThat(context.getBeansOfType(
                    RoomEventDeliveryPort.class))
                    .hasSize(1)
                    .allSatisfy((name, delivery) ->
                            assertThat(delivery).isInstanceOf(
                                    SimpleBrokerRoomEventDeliveryAdapter.class));

            MockHttpServletRequest request =
                    new MockHttpServletRequest("GET", "/api/v1/rooms");
            request.setCookies(new Cookie(
                    CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                    "prod-cookie-token"));
            assertThat(context.getBean(BearerTokenResolver.class)
                    .resolve(request))
                    .isEqualTo("prod-cookie-token");
            assertThat(context.getEnvironment().getProperty(
                    "spring.security.oauth2.resourceserver.jwt.audiences[0]"))
                    .isEqualTo("civic-ai-api");

            CorsConfiguration cors = context.getBean(
                            "corsConfigurationSource",
                            CorsConfigurationSource.class)
                    .getCorsConfiguration(request);
            assertThat(cors).isNotNull();
            assertThat(cors.getAllowedOrigins()).isEmpty();
            assertThat(cors.getAllowCredentials()).isTrue();
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
