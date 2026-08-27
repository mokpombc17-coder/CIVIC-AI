package com.hamcheeze.vote.security.local;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.assertj.core.api.Assertions.assertThat;

class FixtureJwtProfileConfigurationTest {

    @Test
    void localCreatesNamedFixtureDecoder() {
        new ApplicationContextRunner()
                .withPropertyValues("spring.profiles.active=local")
                .withUserConfiguration(FixtureJwtConfiguration.class)
                .run(context -> assertThat(context)
                        .hasSingleBean(FixtureJwtProperties.class)
                        .hasSingleBean(JwtDecoder.class)
                        .hasBean("fixtureJwtDecoder"));
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
