package com.hamcheeze.chat.room.creation;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class RoomCreationPropertiesTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            TestConfiguration.class);

    @Test
    void defaultsFailSafeToApprovalAndThreePendingRequests() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            RoomCreationProperties properties = context.getBean(
                    RoomCreationProperties.class);
            assertThat(properties.mode()).isEqualTo(
                    RoomCreationMode.APPROVAL_REQUIRED);
            assertThat(properties.approvalRequired()).isTrue();
            assertThat(properties.maxPendingRequestsPerUser())
                    .isEqualTo(3);
        });
    }

    @Test
    void bindsDirectModeAndConfiguredPendingLimit() {
        contextRunner.withPropertyValues(
                        "chat.room.creation.mode=DIRECT",
                        "chat.room.creation."
                                + "max-pending-requests-per-user=7")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    RoomCreationProperties properties =
                            context.getBean(
                                    RoomCreationProperties.class);
                    assertThat(properties.mode())
                            .isEqualTo(RoomCreationMode.DIRECT);
                    assertThat(properties.approvalRequired()).isFalse();
                    assertThat(properties
                            .maxPendingRequestsPerUser())
                            .isEqualTo(7);
                });
    }

    @Test
    void rejectsPendingLimitsOutsideSupportedRange() {
        assertInvalidLimit("0");
        assertInvalidLimit("101");
    }

    @Test
    void rejectsUnknownMode() {
        contextRunner.withPropertyValues(
                        "chat.room.creation.mode=UNKNOWN")
                .run(context -> assertThat(context).hasFailed());
    }

    private void assertInvalidLimit(String value) {
        contextRunner.withPropertyValues(
                        "chat.room.creation."
                                + "max-pending-requests-per-user="
                                + value)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(rootCause(context.getStartupFailure()))
                            .isInstanceOf(
                                    IllegalArgumentException.class)
                            .hasMessageContaining(
                                    "maxPendingRequestsPerUser");
                });
    }

    private Throwable rootCause(Throwable failure) {
        Throwable cause = failure;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(RoomCreationProperties.class)
    static class TestConfiguration {
    }
}
