package com.hamcheeze.chat.websocket.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WebSocketEndpointPropertiesBindingTest {

    @Test
    void bindsCommaSeparatedProdOriginsFromEnvironmentVariable() {
        new ApplicationContextRunner()
                .withInitializer(context ->
                        context.getEnvironment()
                                .getPropertySources()
                                .addFirst(new SystemEnvironmentPropertySource(
                                        "testEnvironment",
                                        Map.of(
                                                "CHAT_WEBSOCKET_ALLOWED_ORIGINS",
                                                "https://chat.example,"
                                                        + "https://admin.example"))))
                .withUserConfiguration(PropertiesConfiguration.class)
                .run(context -> assertThat(context.getBean(
                        WebSocketEndpointProperties.class)
                        .getAllowedOrigins())
                        .containsExactly(
                                "https://chat.example",
                                "https://admin.example"));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(WebSocketEndpointProperties.class)
    static class PropertiesConfiguration {
    }
}
