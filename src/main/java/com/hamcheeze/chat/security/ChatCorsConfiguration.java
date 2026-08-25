package com.hamcheeze.chat.security;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ChatCorsProperties.class)
public class ChatCorsConfiguration {

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            ChatCorsProperties properties
    ) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(properties.getAllowedOrigins());
        configuration.setAllowedMethods(
                List.of("GET", "POST", "PUT", "OPTIONS"));
        configuration.setAllowedHeaders(
                List.of(
                        "Content-Type",
                        "Idempotency-Key",
                        "Authorization"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3_600L);
        configuration.validateAllowCredentials();

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration(
                "/api/v1/**",
                configuration);
        return source;
    }
}
