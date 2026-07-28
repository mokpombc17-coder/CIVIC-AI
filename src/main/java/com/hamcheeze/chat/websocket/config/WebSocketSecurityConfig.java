package com.hamcheeze.chat.websocket.config;

import com.hamcheeze.chat.room.api.RoomApiSecurityProblemWriter;
import org.springframework.security.config.Customizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
public class WebSocketSecurityConfig {

    @Bean
    SecurityFilterChain webSocketSecurityFilterChain(
            HttpSecurity http,
            WebSocketEndpointProperties properties,
            RoomApiSecurityProblemWriter problemWriter
    ) throws Exception {
        String endpoint = properties.getEndpoint();
        return http
                .csrf(csrf -> csrf.ignoringRequestMatchers(
                        endpoint,
                        endpoint + "/**",
                        "/api/v1/**"))
                .sessionManagement(session -> session
                        .sessionCreationPolicy(
                                SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                endpoint,
                                endpoint + "/**",
                                "/actuator/health",
                                "/actuator/health/**")
                        .permitAll()
                        .requestMatchers("/api/v1/**")
                        .authenticated()
                        .anyRequest()
                        .authenticated())
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(problemWriter)
                        .accessDeniedHandler(problemWriter))
                .oauth2ResourceServer(resourceServer ->
                        resourceServer
                                .jwt(Customizer.withDefaults())
                                .authenticationEntryPoint(
                                        problemWriter))
                .build();
    }
}
