package com.hamcheeze.vote.security;

import com.hamcheeze.civic.auth.CivicAuthProperties;
import com.hamcheeze.civic.auth.CivicCookieMutationSameOriginFilter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class VoteMainAuthConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withBean(
                            VoteApiSecurityProblemWriter.class,
                            () -> mock(VoteApiSecurityProblemWriter.class))
                    .withUserConfiguration(
                            VoteMainAuthConfiguration.class)
                    .withPropertyValues(
                            "civic.auth.issuer=http://localhost:8080",
                            "civic.auth.jwks-uri=http://localhost:8080/"
                                    + ".well-known/jwks.json",
                            "civic.auth.browser-origin=http://localhost:8080",
                            "civic.auth.allow-insecure-loopback=true");

    @Test
    void localMainAuthModeProvidesAdapterBeans() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=local,auth-main")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(JwtDecoder.class);
                    assertThat(context).hasSingleBean(BearerTokenResolver.class);
                    assertThat(context).hasSingleBean(
                            CivicAuthProperties.class);
                    assertThat(context).hasSingleBean(
                            CivicCookieMutationSameOriginFilter.class);
                    assertThat(context).hasBean("civicMainAuthJwtDecoder");
                    assertThat(context).hasBean("civicBearerTokenResolver");
                });
    }

    @Test
    void fixtureModeDoesNotProvideMainAuthBeans() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=local,auth-fixture")
                .run(context -> {
                    assertThat(context.getBeansOfType(JwtDecoder.class))
                            .isEmpty();
                    assertThat(context.getBeansOfType(
                            BearerTokenResolver.class)).isEmpty();
                    assertThat(context.getBeansOfType(
                            CivicAuthProperties.class)).isEmpty();
                });
    }

    @Test
    void conflictingAuthModesDoNotProvideMainAuthBeans() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active="
                                + "local,auth-fixture,auth-main")
                .run(context -> {
                    assertThat(context.getBeansOfType(JwtDecoder.class))
                            .isEmpty();
                    assertThat(context.getBeansOfType(
                            BearerTokenResolver.class)).isEmpty();
                });
    }
}
