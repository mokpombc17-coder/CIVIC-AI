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
    void rejectsMultipleProfilesEvenWhenOneIsSupported() {
        assertProfileCountRejected("local", "prod");
        assertProfileCountRejected("local", "unknown");
        assertProfileCountRejected("prod", "unknown");
    }

    @Test
    void rejectsUnsupportedSingleProfile() {
        assertUnsupported("dev");
        assertUnsupported("test");
        assertUnsupported("unknown");
    }

    private static void assertAccepted(String profile) {
        RuntimeProfileValidator validator = validator(profile);

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

    private static void assertUnsupported(String profile) {
        RuntimeProfileValidator validator = validator(profile);

        assertThatThrownBy(() ->
                validator.postProcessBeanDefinitionRegistry(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "Unsupported runtime Spring profile: "
                                + profile)
                .hasMessageContaining("local")
                .hasMessageContaining("prod");
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
