package com.hamcheeze.chat.pipeline;

import com.hamcheeze.chat.application.ChatCommandResultSender;
import com.hamcheeze.chat.application.ChatMessageProcessor;
import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import com.hamcheeze.chat.delivery.SimpleBrokerChatMessagePublisher;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.context.LifecycleProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Clock;
import java.time.Duration;
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
            LifecycleProperties lifecycleProperties,
            MeterRegistry meterRegistry
    ) {
        validateShutdownTimeoutRelation(
                properties,
                lifecycleProperties);
        return new InMemoryChatMessagePipeline(
                processor,
                properties,
                Clock.systemUTC(),
                meterRegistry);
    }

    private static void validateShutdownTimeoutRelation(
            ChatMessagePipelineProperties pipelineProperties,
            LifecycleProperties lifecycleProperties
    ) {
        Duration drainTimeout = Duration.ofMillis(
                pipelineProperties.getShutdownDrainTimeoutMs());
        Duration lifecycleTimeout =
                lifecycleProperties.getTimeoutPerShutdownPhase();
        if (lifecycleTimeout == null
                || drainTimeout.compareTo(lifecycleTimeout) >= 0) {
            throw new IllegalStateException(
                    "chat.message-pipeline.shutdown-drain-timeout-ms "
                            + "(" + drainTimeout + ") must be less than "
                            + "spring.lifecycle.timeout-per-shutdown-phase "
                            + "(" + lifecycleTimeout + ")");
        }
    }
}
