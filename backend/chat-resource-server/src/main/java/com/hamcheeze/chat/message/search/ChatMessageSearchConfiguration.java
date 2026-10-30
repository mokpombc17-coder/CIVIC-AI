package com.hamcheeze.chat.message.search;

import com.hamcheeze.chat.room.authorization.RoomAccessReader;
import com.hamcheeze.chat.room.inbox.RoomSequenceReader;
import io.micrometer.core.instrument.MeterRegistry;
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
    ChatMessageSearchRateLimiter chatMessageSearchRateLimiter(
            ChatMessageSearchProperties properties
    ) {
        return new InMemoryChatMessageSearchRateLimiter(
                properties.getUserRateLimitPerSecond(),
                properties.getUserRateLimitBurst());
    }

    @Bean
    ChatMessageSearchConcurrencyGuard
    chatMessageSearchConcurrencyGuard(
            ChatMessageSearchProperties properties,
            MeterRegistry meterRegistry
    ) {
        return new SemaphoreChatMessageSearchConcurrencyGuard(
                properties.getMaxConcurrentSearches(),
                meterRegistry);
    }

    @Bean
    ChatMessageSearchMetrics chatMessageSearchMetrics(
            MeterRegistry meterRegistry
    ) {
        return new MicrometerChatMessageSearchMetrics(meterRegistry);
    }

    @Bean
    ChatMessageSearchService chatMessageSearchService(
            ChatMessageSearchReader reader,
            ChatMessageSearchAccessResolver accessResolver,
            RoomSequenceReader sequenceReader,
            ChatMessageSearchNormalizer normalizer,
            ChatMessageSearchCursorCodec cursorCodec,
            ChatMessageSearchProperties properties,
            ChatMessageSearchRateLimiter rateLimiter,
            ChatMessageSearchConcurrencyGuard concurrencyGuard,
            ChatMessageSearchMetrics metrics
    ) {
        return new ChatMessageSearchService(
                reader,
                accessResolver,
                sequenceReader,
                normalizer,
                cursorCodec,
                properties,
                rateLimiter,
                concurrencyGuard,
                metrics,
                System::nanoTime);
    }
}
