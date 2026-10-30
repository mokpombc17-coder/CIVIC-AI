package com.hamcheeze.chat.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class LocalProductionBehaviorParityTest {

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withInitializer(
                            new ConfigDataApplicationContextInitializer());

    @Test
    void localUsesProductionRoomCreationBehavior() {
        runner.withPropertyValues("spring.profiles.active=local")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getEnvironment().getProperty(
                            "chat.room.creation.mode"))
                            .isEqualTo("APPROVAL_REQUIRED");
                });
    }
}
