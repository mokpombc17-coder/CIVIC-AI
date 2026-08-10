package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.inbox.RoomSequenceReader;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ChatMessageSearchProperties.class)
public class ChatMessageSearchConfiguration {

    @Bean
    ChatMessageSearchNormalizer chatMessageSearchNormalizer() {
        return new ChatMessageSearchNormalizer();
    }

    @Bean
    ChatMessageSearchAccessResolver
    chatMessageSearchAccessResolver(
            RoomAccessReader accessReader
    ) {
        return new ChatMessageSearchAccessResolver(accessReader);
    }

    @Bean
    ChatMessageSearchCursorCodec chatMessageSearchCursorCodec(
            ObjectMapper objectMapper,
            ChatMessageSearchProperties properties
    ) {
        return new ChatMessageSearchCursorCodec(
                objectMapper,
                Clock.systemUTC(),
                properties.getCursorTtl());
    }

    @Bean
    ChatMessageSearchService chatMessageSearchService(
            ChatMessageSearchReader reader,
            ChatMessageSearchAccessResolver accessResolver,
            RoomSequenceReader sequenceReader,
            ChatMessageSearchNormalizer normalizer,
            ChatMessageSearchCursorCodec cursorCodec,
            ChatMessageSearchProperties properties
    ) {
        return new ChatMessageSearchService(
                reader,
                accessResolver,
                sequenceReader,
                normalizer,
                cursorCodec,
                properties);
    }
}
