package com.hamcheeze.chat.websocket.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Configuration(proxyBeanMethods = false)
@Profile("local")
@EnableConfigurationProperties(LocalJwtProperties.class)
public class LocalJwtConfiguration {

    private final LocalJwtProperties properties;

    public LocalJwtConfiguration(
            LocalJwtProperties properties
    ) {
        this.properties = properties;
    }

    @Bean
    JwtDecoder localJwtDecoder() {
        SecretKeySpec secretKey = new SecretKeySpec(
                properties.getSecret().getBytes(StandardCharsets.UTF_8),
                "HmacSHA256");
        NimbusJwtDecoder decoder =
                NimbusJwtDecoder.withSecretKey(secretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        OAuth2TokenValidator<Jwt> audienceValidator = jwt ->
                jwt.getAudience().contains(properties.getAudience())
                        ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(
                                new OAuth2Error(
                                        "invalid_token",
                                        "Required audience is missing",
                                        null));
        OAuth2TokenValidator<Jwt> subjectValidator = jwt ->
                jwt.getSubject() != null && !jwt.getSubject().isBlank()
                        ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(
                                new OAuth2Error(
                                        "invalid_token",
                                        "Subject is required",
                                        null));
        decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(
                        JwtValidators.createDefaultWithIssuer(
                                properties.getIssuer()),
                        audienceValidator,
                        subjectValidator));
        return decoder;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(
                List.of("http://localhost:3000"));
        configuration.setAllowedMethods(
                List.of("GET", "POST", "PUT", "OPTIONS"));
        configuration.setAllowedHeaders(
                List.of(
                        "Content-Type",
                        "Idempotency-Key",
                        "Authorization"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3_600L);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration(
                "/api/v1/**",
                configuration);
        return source;
    }
}
