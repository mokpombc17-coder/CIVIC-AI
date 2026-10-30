package com.hamcheeze.civic.auth;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CivicAuthProperties.class)
public class CivicMainAuthConfiguration {

    @Bean("civicMainAuthJwtDecoder")
    JwtDecoder civicMainAuthJwtDecoder(
            CivicAuthProperties properties,
            Environment environment
    ) {
        properties.validate(environment.acceptsProfiles(Profiles.of("prod")));
        return CivicJwtDecoderFactory.create(properties);
    }

    @Bean("civicBearerTokenResolver")
    BearerTokenResolver civicBearerTokenResolver() {
        return new CivicBearerTokenResolver();
    }
}
