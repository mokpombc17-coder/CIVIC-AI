package com.hamcheeze.chat.message.context;

import com.hamcheeze.chat.message.search.ChatMessageSearchAccessResolver;
import com.hamcheeze.chat.message.search.ChatMessageSearchProperties;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ChatMessageContextConfiguration {

    @Bean
    ChatMessageContextMetrics chatMessageContextMetrics(
            MeterRegistry meterRegistry
    ) {
        return new MicrometerChatMessageContextMetrics(meterRegistry);
    }

    @Bean
    ChatMessageContextService chatMessageContextService(
            ChatMessageContextReader reader,
            ChatMessageSearchAccessResolver accessResolver,
            ChatMessageSearchProperties properties,
            ChatMessageContextMetrics metrics
    ) {
        return new ChatMessageContextService(
                reader,
                accessResolver,
                properties,
                metrics);
    }
}
