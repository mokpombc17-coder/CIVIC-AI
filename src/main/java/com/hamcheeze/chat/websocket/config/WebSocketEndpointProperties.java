package com.hamcheeze.chat.websocket.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties("chat.websocket")
public class WebSocketEndpointProperties {

    private String endpoint = "/ws";
    private List<String> allowedOrigins = new ArrayList<>();

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public List<String> getAllowedOrigins() {
        return allowedOrigins;
    }

    public void setAllowedOrigins(List<String> allowedOrigins) {
        this.allowedOrigins = new ArrayList<>(allowedOrigins);
    }
}
