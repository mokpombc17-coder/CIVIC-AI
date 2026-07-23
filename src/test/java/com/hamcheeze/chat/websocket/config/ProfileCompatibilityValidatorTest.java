package com.hamcheeze.chat.websocket.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProfileCompatibilityValidatorTest {

    @Test
    void rejectsConflictingTemporaryAndProductionProfiles() {
        assertConflict("prod", "skeleton");
        assertConflict("prod", "limit-test");
        assertConflict("skeleton", "limit-test");
    }

    @Test
    void acceptsOneExplicitProfile() {
        ProfileCompatibilityValidator validator =
                new ProfileCompatibilityValidator();
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("skeleton");
        validator.setEnvironment(environment);

        assertThatCode(() ->
                validator.postProcessBeanDefinitionRegistry(null))
                .doesNotThrowAnyException();
    }

    private static void assertConflict(String first, String second) {
        ProfileCompatibilityValidator validator =
                new ProfileCompatibilityValidator();
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(first, second);
        validator.setEnvironment(environment);

        assertThatThrownBy(() ->
                validator.postProcessBeanDefinitionRegistry(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Incompatible profiles");
    }
}
