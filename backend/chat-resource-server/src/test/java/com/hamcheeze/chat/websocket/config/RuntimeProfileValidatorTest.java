package com.hamcheeze.chat.websocket.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RuntimeProfileValidatorTest {

    @Test
    void acceptsEachSupportedRuntimeProfileAlone() {
        assertAccepted("local");
        assertAccepted("prod");
    }

    @Test
    void acceptsOneRuntimeProfileWithAuxiliaryProfiles() {
        assertAccepted("local", "auth-fixture");
        assertAccepted("local", "auth-main");
        assertAccepted("prod", "stage", "auth-main");
    }

    @Test
    void rejectsMissingRuntimeProfile() {
        RuntimeProfileValidator validator = validator();

        assertThatThrownBy(() ->
                validator.postProcessBeanDefinitionRegistry(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "Exactly one runtime Spring profile")
                .hasMessageContaining("active=[]");
    }

    @Test
    void rejectsMultipleRuntimeProfiles() {
        assertProfileCountRejected("local", "prod");
        assertProfileCountRejected(
                "local", "prod", "stage", "auth-main");
    }

    @Test
    void rejectsProfilesWithoutRuntimeProfile() {
        assertProfileCountRejected("dev");
        assertProfileCountRejected("test", "auth-fixture");
        assertProfileCountRejected("stage", "auth-main");
    }

    private static void assertAccepted(String... profiles) {
        RuntimeProfileValidator validator = validator(profiles);

        assertThatCode(() ->
                validator.postProcessBeanDefinitionRegistry(null))
                .doesNotThrowAnyException();
    }

    private static void assertProfileCountRejected(
            String... profiles
    ) {
        RuntimeProfileValidator validator = validator(profiles);

        assertThatThrownBy(() ->
                validator.postProcessBeanDefinitionRegistry(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "Exactly one runtime Spring profile")
                .hasMessageContaining("active=");
    }

    private static RuntimeProfileValidator validator(
            String... profiles
    ) {
        RuntimeProfileValidator validator =
                new RuntimeProfileValidator();
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profiles);
        validator.setEnvironment(environment);
        return validator;
    }
}
