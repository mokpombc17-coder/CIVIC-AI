package com.hamcheeze.civic.auth;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;

import static org.assertj.core.api.Assertions.assertThat;

class CivicMainAuthConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            CivicMainAuthConfiguration.class)
                    .withPropertyValues(
                            "civic.auth.issuer=https://issuer.example",
                            "civic.auth.jwks-uri=https://issuer.example/"
                                    + ".well-known/jwks.json",
                            "civic.auth.browser-origin=https://app.example");

    @Test
    void providesExplicitDecoderAndCredentialResolverBeans() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(JwtDecoder.class);
            assertThat(context).hasSingleBean(BearerTokenResolver.class);
            assertThat(context).hasSingleBean(CivicAuthProperties.class);
        });
    }

    @Test
    void failsClosedForAnInsecureIssuer() {
        contextRunner
                .withPropertyValues(
                        "civic.auth.issuer=http://issuer.example")
                .run(context -> assertThat(context)
                        .hasFailed());
    }

    @Test
    void allowsExplicitLoopbackHttpEndpointsOutsideProduction() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=local",
                        "civic.auth.issuer=http://localhost:8080",
                        "civic.auth.jwks-uri=http://localhost:8080/"
                                + ".well-known/jwks.json",
                        "civic.auth.browser-origin=http://localhost:8080",
                        "civic.auth.allow-insecure-loopback=true")
                .run(context -> assertThat(context)
                        .hasSingleBean(JwtDecoder.class));
    }

    @Test
    void rejectsLoopbackOptInInProduction() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=prod",
                        "civic.auth.issuer=http://localhost:8080",
                        "civic.auth.jwks-uri=http://localhost:8080/"
                                + ".well-known/jwks.json",
                        "civic.auth.browser-origin=http://localhost:8080",
                        "civic.auth.allow-insecure-loopback=true")
                .run(context -> assertThat(context)
                        .hasFailed());
    }
}
