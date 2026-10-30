package com.hamcheeze.chat.websocket.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class WebSocketEndpointPropertiesBindingTest {

    @Test
    void bindsSingleProdOriginFromEnvironmentVariable() {
        new ApplicationContextRunner()
                .withInitializer(
                        new ConfigDataApplicationContextInitializer())
                .withPropertyValues(
                        "spring.profiles.active=prod",
                        "CHAT_WEBSOCKET_ALLOWED_ORIGIN="
                                + "https://chat.example")
                .withUserConfiguration(PropertiesConfiguration.class)
                .run(context -> assertThat(context.getBean(
                        WebSocketEndpointProperties.class)
                        .getAllowedOrigins())
                        .containsExactly("https://chat.example"));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(WebSocketEndpointProperties.class)
    static class PropertiesConfiguration {
    }
}
