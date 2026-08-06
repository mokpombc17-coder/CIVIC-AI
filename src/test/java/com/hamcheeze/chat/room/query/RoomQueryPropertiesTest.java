package com.hamcheeze.chat.room.query;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class RoomQueryPropertiesTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            QueryPropertiesConfiguration.class);

    @Test
    void defaultsListedRoomPageQueryMaxTimeToOneSecond() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(RoomQueryProperties.class)
                    .listedRoomPageQueryMaxTime())
                    .isEqualTo(Duration.ofSeconds(1));
        });
    }

    @Test
    void acceptsConfiguredDurationWithinInclusiveBounds() {
        assertValid("1ms", Duration.ofMillis(1));
        assertValid("30s", Duration.ofSeconds(30));
    }

    @Test
    void rejectsConfiguredDurationOutsideBoundsDuringBinding() {
        assertInvalid("0ms");
        assertInvalid("31s");
    }

    private void assertValid(
            String value,
            Duration expected
    ) {
        contextRunner
                .withPropertyValues(property(value))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(
                            RoomQueryProperties.class)
                            .listedRoomPageQueryMaxTime())
                            .isEqualTo(expected);
                });
    }

    private void assertInvalid(String value) {
        contextRunner
                .withPropertyValues(property(value))
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(rootCause(
                            context.getStartupFailure()))
                            .isInstanceOf(
                                    IllegalArgumentException.class)
                            .hasMessageContaining(
                                    "listedRoomPageQueryMaxTime");
                });
    }

    private String property(String value) {
        return "chat.room-query."
                + "listed-room-page-query-max-time="
                + value;
    }

    private Throwable rootCause(Throwable failure) {
        Throwable cause = failure;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(RoomQueryProperties.class)
    static class QueryPropertiesConfiguration {
    }
}
