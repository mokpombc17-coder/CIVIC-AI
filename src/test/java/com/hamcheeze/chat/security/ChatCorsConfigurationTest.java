package com.hamcheeze.chat.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatCorsConfigurationTest {

    private final ChatCorsConfiguration configuration =
            new ChatCorsConfiguration();

    @Test
    void configuresExactCredentialedOriginsForRestApi() {
        ChatCorsProperties properties = new ChatCorsProperties();
        properties.setAllowedOrigins(List.of(
                " https://app.example ",
                "https://app.example"));

        var source = configuration.corsConfigurationSource(properties);
        CorsConfiguration cors = source.getCorsConfiguration(
                new MockHttpServletRequest("GET", "/api/v1/rooms"));

        assertThat(cors).isNotNull();
        assertThat(cors.getAllowedOrigins())
                .containsExactly("https://app.example");
        assertThat(cors.getAllowedMethods())
                .containsExactly("GET", "POST", "PUT", "OPTIONS");
        assertThat(cors.getAllowedHeaders())
                .containsExactly(
                        "Content-Type",
                        "Idempotency-Key",
                        "Authorization");
        assertThat(cors.getAllowCredentials()).isTrue();
        assertThat(cors.getMaxAge()).isEqualTo(3_600L);
    }

    @Test
    void rejectsWildcardOriginWithCredentials() {
        ChatCorsProperties properties = new ChatCorsProperties();
        properties.setAllowedOrigins(List.of("*"));

        assertThatThrownBy(() ->
                configuration.corsConfigurationSource(properties))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("allowCredentials");
    }

    @Test
    void bindsCommaSeparatedEnvironmentOriginList() {
        new ApplicationContextRunner()
                .withUserConfiguration(ChatCorsConfiguration.class)
                .withPropertyValues(
                        "chat.security.cors.allowed-origins="
                                + "https://app.example,"
                                + "https://admin.example")
                .run(context -> {
                    CorsConfigurationSource source = context.getBean(
                            "corsConfigurationSource",
                            CorsConfigurationSource.class);
                    CorsConfiguration cors = source.getCorsConfiguration(
                            new MockHttpServletRequest(
                                    "GET", "/api/v1/rooms"));

                    assertThat(cors).isNotNull();
                    assertThat(cors.getAllowedOrigins())
                            .containsExactly(
                                    "https://app.example",
                                    "https://admin.example");
                });
    }
}
