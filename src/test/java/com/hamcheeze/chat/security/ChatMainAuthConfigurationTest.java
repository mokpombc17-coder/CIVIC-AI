package com.hamcheeze.chat.security;

import com.hamcheeze.chat.room.api.RoomApiSecurityProblemWriter;
import com.hamcheeze.civic.auth.CivicAuthProperties;
import com.hamcheeze.civic.auth.CivicCookieMutationSameOriginFilter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class ChatMainAuthConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withBean(
                            RoomApiSecurityProblemWriter.class,
                            () -> mock(RoomApiSecurityProblemWriter.class))
                    .withUserConfiguration(
                            ChatMainAuthConfiguration.class)
                    .withPropertyValues(
                            "civic.auth.issuer="
                                    + "https://140-238-17-223.sslip.io",
                            "civic.auth.jwks-uri="
                                    + "https://140-238-17-223.sslip.io/"
                                    + ".well-known/jwks.json",
                            "civic.auth.browser-origin="
                                    + "https://140-238-17-223.sslip.io");

    @Test
    void stageMainAuthModeProvidesSharedAdapterBeans() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active=prod,stage,auth-main")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(JwtDecoder.class);
                    assertThat(context).hasSingleBean(
                            BearerTokenResolver.class);
                    assertThat(context).hasSingleBean(
                            CivicAuthProperties.class);
                    assertThat(context).hasSingleBean(
                            CivicCookieMutationSameOriginFilter.class);
                    assertThat(context).hasBean("civicMainAuthJwtDecoder");
                    assertThat(context).hasBean(
                            "civicBearerTokenResolver");
                });
    }

    @Test
    void conflictingAuthModesDoNotProvideMainAuthBeans() {
        contextRunner
                .withPropertyValues(
                        "spring.profiles.active="
                                + "prod,stage,auth-fixture,auth-main")
                .run(context -> {
                    assertThat(context.getBeansOfType(JwtDecoder.class))
                            .isEmpty();
                    assertThat(context.getBeansOfType(
                            BearerTokenResolver.class)).isEmpty();
                });
    }
}
