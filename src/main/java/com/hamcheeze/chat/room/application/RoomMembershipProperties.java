package com.hamcheeze.chat.room.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("chat.room.membership")
public class RoomMembershipProperties {

    private int maxActiveMembersPerRoom = 50;

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
}
