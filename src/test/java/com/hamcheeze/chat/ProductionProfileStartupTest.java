package com.hamcheeze.chat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.boot.SpringApplication;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductionProfileStartupTest {

    @Test
    void productionCannotStartWithoutRealPipelineAndAuthorization() {
        SpringApplication application =
                new SpringApplication(ChatServerApplication.class);
        application.setLogStartupInfo(false);

        assertThatThrownBy(() -> {
            try (var ignored = application.run(
                    "--spring.profiles.active=prod",
                    "--server.port=0",
                    "--spring.main.banner-mode=off")) {
                // The context must not reach this block.
            }
        })
                .hasRootCauseInstanceOf(NoSuchBeanDefinitionException.class);
    }
}
