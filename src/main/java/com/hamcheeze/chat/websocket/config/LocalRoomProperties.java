package com.hamcheeze.chat.websocket.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties("chat.authorization.local")
public class LocalRoomProperties {

    private List<String> allowedRooms = new ArrayList<>(List.of("test-room"));

    public List<String> getAllowedRooms() {
        return allowedRooms;
    }

    public void setAllowedRooms(List<String> allowedRooms) {
        this.allowedRooms = new ArrayList<>(allowedRooms);
    }
}
