package com.hamcheeze.chat.room.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("chat.room.participation")
public class RoomParticipationProperties {

    private boolean enabled = true;

    public boolean enabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
