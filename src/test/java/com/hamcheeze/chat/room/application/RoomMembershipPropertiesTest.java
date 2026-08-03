package com.hamcheeze.chat.room.application;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class RoomMembershipPropertiesTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            MembershipPropertiesConfiguration.class);

    @Test
    void defaultsToFiftyAndDoesNotDependOnSubscriberLimit() {
        contextRunner
                .withPropertyValues(
                        "chat.websocket.subscription."
                                + "max-subscribers-per-room=7")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(
                            RoomMembershipProperties.class)
                            .maxActiveMembersPerRoom())
                            .isEqualTo(50);
                });
    }

    @Test
    void acceptsOneAsMinimum() {
        contextRunner
                .withPropertyValues(
                        "chat.room.membership."
                                + "max-active-members-per-room=1")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(
                            RoomMembershipProperties.class)
                            .maxActiveMembersPerRoom())
                            .isEqualTo(1);
                });
    }

    @Test
    void rejectsZeroAndNegativeValuesDuringStartupBinding() {
        assertInvalid("0");
        assertInvalid("-1");
    }

    private void assertInvalid(String value) {
        contextRunner
                .withPropertyValues(
                        "chat.room.membership."
                                + "max-active-members-per-room="
                                + value)
                .run(context -> {
                    assertThat(context).hasFailed();
                    Throwable rootCause = rootCause(
                            context.getStartupFailure());
                    assertThat(rootCause)
                            .isInstanceOf(IllegalArgumentException.class)
                            .hasMessageContaining(
                                    "maxActiveMembersPerRoom");
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
    @EnableConfigurationProperties(
            RoomMembershipProperties.class)
    static class MembershipPropertiesConfiguration {
    }
}
