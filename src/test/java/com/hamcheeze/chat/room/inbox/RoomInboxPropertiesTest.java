package com.hamcheeze.chat.room.inbox;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomInboxPropertiesTest {

    @Test
    void countQueryMaxTimeAcceptsInclusiveBounds() {
        RoomInboxProperties properties = new RoomInboxProperties();

        properties.setCountQueryMaxTime(Duration.ofMillis(1));
        assertThat(properties.getCountQueryMaxTime())
                .isEqualTo(Duration.ofMillis(1));

        properties.setCountQueryMaxTime(Duration.ofSeconds(30));
        assertThat(properties.getCountQueryMaxTime())
                .isEqualTo(Duration.ofSeconds(30));
    }

    @Test
    void countQueryMaxTimeRejectsValuesOutsideBounds() {
        RoomInboxProperties properties = new RoomInboxProperties();

        assertThatThrownBy(() -> properties.setCountQueryMaxTime(
                Duration.ofNanos(999_999)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> properties.setCountQueryMaxTime(
                Duration.ofSeconds(30).plusNanos(1)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
