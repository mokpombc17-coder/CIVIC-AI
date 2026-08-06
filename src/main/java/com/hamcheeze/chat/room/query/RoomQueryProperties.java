package com.hamcheeze.chat.room.query;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Objects;

@ConfigurationProperties("chat.room-query")
public class RoomQueryProperties {

    private Duration listedRoomPageQueryMaxTime =
            Duration.ofSeconds(1);

    public Duration listedRoomPageQueryMaxTime() {
        return listedRoomPageQueryMaxTime;
    }

    public void setListedRoomPageQueryMaxTime(
            Duration listedRoomPageQueryMaxTime
    ) {
        Duration resolved = Objects.requireNonNull(
                listedRoomPageQueryMaxTime,
                "listedRoomPageQueryMaxTime");
        if (resolved.compareTo(Duration.ofMillis(1)) < 0
                || resolved.compareTo(Duration.ofSeconds(30)) > 0) {
            throw new IllegalArgumentException(
                    "listedRoomPageQueryMaxTime must be between "
                            + "1ms and 30s");
        }
        this.listedRoomPageQueryMaxTime = resolved;
    }
}
