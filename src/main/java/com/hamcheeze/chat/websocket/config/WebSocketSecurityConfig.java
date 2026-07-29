package com.hamcheeze.chat.websocket.config;

import com.hamcheeze.chat.room.api.RoomApiSecurityProblemWriter;
import com.hamcheeze.chat.security.ChatScopes;
import com.hamcheeze.chat.security.CookieOrHeaderBearerTokenResolver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
public class WebSocketSecurityConfig {

    @Bean
    SecurityFilterChain webSocketSecurityFilterChain(
            HttpSecurity http,
            WebSocketEndpointProperties properties,
            RoomApiSecurityProblemWriter problemWriter,
            BearerTokenResolver bearerTokenResolver
    ) throws Exception {
        String endpoint = properties.getEndpoint();
        return http
                .cors(Customizer.withDefaults())
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
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/rooms/**")
                        .hasAuthority(ChatScopes.authority(
                                ChatScopes.ROOMS_READ))
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/v1/rooms/**")
                        .hasAuthority(ChatScopes.authority(
                                ChatScopes.ROOMS_WRITE))
                        .requestMatchers("/api/v1/**")
                        .authenticated()
                        .anyRequest()
                        .authenticated())
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(problemWriter)
                        .accessDeniedHandler(problemWriter))
                .oauth2ResourceServer(resourceServer ->
                        resourceServer
                                .bearerTokenResolver(bearerTokenResolver)
                                .jwt(Customizer.withDefaults())
                                .authenticationEntryPoint(
                                        problemWriter))
                .build();
    }

    @Bean
    BearerTokenResolver chatBearerTokenResolver(
            @Value("${chat.security.cookie-authentication-enabled:false}")
            boolean cookieAuthenticationEnabled
    ) {
        return new CookieOrHeaderBearerTokenResolver(
                cookieAuthenticationEnabled);
    }
}
