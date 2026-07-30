package com.hamcheeze.chat.message.api;

import com.hamcheeze.chat.message.query.ChatMessageHistoryReader;
import com.hamcheeze.chat.message.query.ChatMessageHistoryService;
import com.hamcheeze.chat.room.authorization.RoomMessageAccessResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ChatMessageQueryConfiguration {

    @Bean
    ChatMessageHistoryService chatMessageHistoryService(
            ChatMessageHistoryReader reader,
            RoomMessageAccessResolver accessResolver
    ) {
        return new ChatMessageHistoryService(
                reader,
                accessResolver);
    }
}
