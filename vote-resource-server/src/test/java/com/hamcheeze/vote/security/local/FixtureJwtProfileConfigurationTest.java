package com.hamcheeze.vote.security.local;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.assertj.core.api.Assertions.assertThat;

class FixtureJwtProfileConfigurationTest {

    @Test
    void localFixtureModeCreatesNamedFixtureDecoder() {
        new ApplicationContextRunner()
                .withPropertyValues(
                        "spring.profiles.active=local,auth-fixture")
                .withUserConfiguration(FixtureJwtConfiguration.class)
                .run(context -> assertThat(context)
                        .hasSingleBean(FixtureJwtProperties.class)
                        .hasSingleBean(JwtDecoder.class)
                        .hasBean("fixtureJwtDecoder"));
    }

    @Test
    void localMainAuthModeDoesNotCreateFixtureDecoder() {
        new ApplicationContextRunner()
                .withPropertyValues(
                        "spring.profiles.active=local,auth-main")
                .withUserConfiguration(FixtureJwtConfiguration.class)
                .run(context -> {
                    assertThat(context.getBeansOfType(
                            FixtureJwtProperties.class)).isEmpty();
                    assertThat(context.getBeansOfType(
                            JwtDecoder.class)).isEmpty();
                });
    }

    @Test
    void prodDoesNotCreateFixtureDecoder() {
        new ApplicationContextRunner()
                .withPropertyValues("spring.profiles.active=prod")
                .withUserConfiguration(FixtureJwtConfiguration.class)
                .run(context -> {
                    assertThat(context.getBeansOfType(
                            FixtureJwtProperties.class)).isEmpty();
                    assertThat(context.getBeansOfType(
                            JwtDecoder.class)).isEmpty();
                });
    }
}
