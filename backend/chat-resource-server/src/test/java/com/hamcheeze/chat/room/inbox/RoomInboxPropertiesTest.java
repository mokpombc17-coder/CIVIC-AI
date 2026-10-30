package com.hamcheeze.chat.room.inbox;

import com.hamcheeze.chat.room.inbox.notification.RoomInboxEvent;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
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

    @Test
    void publicEventSourceLimitAcceptsContractBounds() {
        RoomInboxProperties properties = new RoomInboxProperties();
        try (ValidatorFactory factory = Validation
                .buildDefaultValidatorFactory()) {
            properties.getNotification().setMaxEventsPerRoomBatch(1);
            assertThat(factory.getValidator().validate(properties))
                    .isEmpty();

            properties.getNotification().setMaxEventsPerRoomBatch(
                    RoomInboxEvent.MAX_SOURCE_EVENT_IDS);
            assertThat(factory.getValidator().validate(properties))
                    .isEmpty();
        }
    }

    @Test
    void publicEventSourceLimitRejectsValuesOutsideContract() {
        RoomInboxProperties properties = new RoomInboxProperties();
        try (ValidatorFactory factory = Validation
                .buildDefaultValidatorFactory()) {
            properties.getNotification().setMaxEventsPerRoomBatch(0);
            assertThat(factory.getValidator().validate(properties))
                    .isNotEmpty();

            properties.getNotification().setMaxEventsPerRoomBatch(
                    RoomInboxEvent.MAX_SOURCE_EVENT_IDS + 1);
            assertThat(factory.getValidator().validate(properties))
                    .isNotEmpty();
        }
    }
}
