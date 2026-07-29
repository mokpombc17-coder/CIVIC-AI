package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.message.query.ChatMessageHistoryReader;
import com.hamcheeze.chat.message.query.ChatMessageHistoryService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ChatMessageQueryConfiguration {

    @Bean
    ChatMessageHistoryService chatMessageHistoryService(
            ChatMessageHistoryReader reader,
            RoomAuthorizationService authorizationService
    ) {
        return new ChatMessageHistoryService(
                reader,
                authorizationService);
    }
}
