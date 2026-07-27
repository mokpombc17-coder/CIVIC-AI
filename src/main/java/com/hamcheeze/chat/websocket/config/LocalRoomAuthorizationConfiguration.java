package com.hamcheeze.chat.websocket.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("local")
@EnableConfigurationProperties(LocalRoomProperties.class)
public class LocalRoomAuthorizationConfiguration {
}
