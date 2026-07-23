package com.hamcheeze.chat.websocket.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
public class WebSocketSecurityConfig {

    @Bean
    SecurityFilterChain webSocketSecurityFilterChain(
            HttpSecurity http,
            WebSocketEndpointProperties properties
    ) throws Exception {
        String endpoint = properties.getEndpoint();
        return http
                .csrf(csrf -> csrf.ignoringRequestMatchers(
                        endpoint, endpoint + "/**"))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                endpoint,
                                endpoint + "/**",
                                "/actuator/health",
                                "/actuator/health/**")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .build();
    }
}
