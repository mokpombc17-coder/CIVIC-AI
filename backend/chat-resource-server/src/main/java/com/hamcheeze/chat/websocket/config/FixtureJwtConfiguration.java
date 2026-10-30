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

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

@Configuration(proxyBeanMethods = false)
@Profile("local & !auth-main")
@EnableConfigurationProperties(FixtureJwtProperties.class)
public class FixtureJwtConfiguration {

    private final FixtureJwtProperties properties;

    public FixtureJwtConfiguration(
            FixtureJwtProperties properties
    ) {
        this.properties = properties;
    }

    @Bean("fixtureJwtDecoder")
    JwtDecoder fixtureJwtDecoder() {
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
}
