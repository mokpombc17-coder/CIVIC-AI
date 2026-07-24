package com.hamcheeze.chat.pipeline;

import com.hamcheeze.chat.application.ChatCommandResultSender;
import com.hamcheeze.chat.application.ChatMessageProcessor;
import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import com.hamcheeze.chat.delivery.SimpleBrokerChatMessagePublisher;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Clock;
import java.util.UUID;

@Configuration(proxyBeanMethods = false)
@Profile("limit-test")
@ConditionalOnProperty(
        prefix = "chat.message-pipeline",
        name = "mode",
        havingValue = "in-memory")
public class InMemoryChatMessagePipelineConfiguration {

    @Bean
    InMemoryChatMessageStore inMemoryChatMessageStore(
            MeterRegistry meterRegistry
    ) {
        return new InMemoryChatMessageStore(
                Clock.systemUTC(),
                () -> UUID.randomUUID().toString(),
                meterRegistry);
    }

    @Bean
    ChatMessagePublisher chatMessagePublisher(
            SimpMessagingTemplate messagingTemplate,
            MeterRegistry meterRegistry
    ) {
        return new SimpleBrokerChatMessagePublisher(
                messagingTemplate,
                meterRegistry);
    }

    @Bean
    ChatMessageProcessor chatMessageProcessor(
            ChatMessageStore messageStore,
            ChatMessagePublisher messagePublisher,
            ChatCommandResultSender resultSender,
            MeterRegistry meterRegistry
    ) {
        return new ChatMessageProcessor(
                messageStore,
                messagePublisher,
                resultSender,
                meterRegistry);
    }

    @Bean
    InMemoryChatMessagePipeline inMemoryChatMessagePipeline(
            ChatMessageProcessor processor,
            ChatMessagePipelineProperties properties,
            MeterRegistry meterRegistry
    ) {
        return new InMemoryChatMessagePipeline(
                processor,
                properties,
                Clock.systemUTC(),
                meterRegistry);
    }
}
