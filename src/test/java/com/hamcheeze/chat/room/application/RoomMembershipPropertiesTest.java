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
    void defaultsToFiftyMembersAndTwentyRooms() {
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
                    assertThat(context.getBean(
                            RoomMembershipProperties.class)
                            .maxActiveRoomsPerUser())
                            .isEqualTo(20);
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

    @Test
    void acceptsOneAsMinimumActiveRoomLimit() {
        contextRunner
                .withPropertyValues(
                        "chat.room.membership."
                                + "max-active-rooms-per-user=1")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(
                            RoomMembershipProperties.class)
                            .maxActiveRoomsPerUser())
                            .isEqualTo(1);
                });
    }

    @Test
    void rejectsInvalidActiveRoomLimitsDuringStartupBinding() {
        assertInvalidActiveRoomLimit("0");
        assertInvalidActiveRoomLimit("-1");
    }

    @Test
    void bindsActiveRoomLimitAndCountTimeoutOverrides() {
        contextRunner
                .withPropertyValues(
                        "chat.room.membership."
                                + "max-active-rooms-per-user=37",
                        "chat.room.membership."
                                + "active-room-count-query-max-time=2s")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    RoomMembershipProperties properties =
                            context.getBean(
                                    RoomMembershipProperties.class);
                    assertThat(properties.maxActiveRoomsPerUser())
                            .isEqualTo(37);
                    assertThat(properties
                            .activeRoomCountQueryMaxTime())
                            .isEqualTo(java.time.Duration.ofSeconds(2));
                });
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

    private void assertInvalidActiveRoomLimit(String value) {
        contextRunner
                .withPropertyValues(
                        "chat.room.membership."
                                + "max-active-rooms-per-user="
                                + value)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(rootCause(context.getStartupFailure()))
                            .isInstanceOf(IllegalArgumentException.class)
                            .hasMessageContaining(
                                    "maxActiveRoomsPerUser");
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
