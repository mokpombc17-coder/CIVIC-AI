package com.hamcheeze.chat.room.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Objects;

@ConfigurationProperties("chat.room.membership")
public class RoomMembershipProperties {

    private int maxActiveMembersPerRoom = 50;
    private int maxActiveRoomsPerUser = 20;
    private Duration activeRoomCountQueryMaxTime =
            Duration.ofSeconds(1);

    public int maxActiveMembersPerRoom() {
        return maxActiveMembersPerRoom;
    }

    public void setMaxActiveMembersPerRoom(
            int maxActiveMembersPerRoom
    ) {
        if (maxActiveMembersPerRoom < 1) {
            throw new IllegalArgumentException(
                    "maxActiveMembersPerRoom must be at least 1");
        }
        this.maxActiveMembersPerRoom = maxActiveMembersPerRoom;
    }

    public int maxActiveRoomsPerUser() {
        return maxActiveRoomsPerUser;
    }

    public void setMaxActiveRoomsPerUser(
            int maxActiveRoomsPerUser
    ) {
        if (maxActiveRoomsPerUser < 1) {
            throw new IllegalArgumentException(
                    "maxActiveRoomsPerUser must be at least 1");
        }
        this.maxActiveRoomsPerUser = maxActiveRoomsPerUser;
    }

    public Duration activeRoomCountQueryMaxTime() {
        return activeRoomCountQueryMaxTime;
    }

    public void setActiveRoomCountQueryMaxTime(
            Duration activeRoomCountQueryMaxTime
    ) {
        this.activeRoomCountQueryMaxTime = Objects.requireNonNull(
                activeRoomCountQueryMaxTime,
                "activeRoomCountQueryMaxTime");
        if (activeRoomCountQueryMaxTime.compareTo(
                Duration.ofMillis(1)) < 0
                || activeRoomCountQueryMaxTime.compareTo(
                Duration.ofSeconds(30)) > 0) {
            throw new IllegalArgumentException(
                    "activeRoomCountQueryMaxTime must be between "
                            + "1ms and 30s");
        }
    }
}
