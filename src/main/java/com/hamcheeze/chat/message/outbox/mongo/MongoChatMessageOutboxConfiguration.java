package com.hamcheeze.chat.message.outbox.mongo;

import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxDispatcher;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxMetricsSampler;
import com.hamcheeze.chat.message.outbox.ChatMessageOutboxProperties;
import com.hamcheeze.chat.websocket.config.WebSocketTransportProperties;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.context.LifecycleProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoOperations;

import java.time.Clock;
import java.time.Duration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ChatMessageOutboxProperties.class)
public class MongoChatMessageOutboxConfiguration {

    @Bean(initMethod = "initialize")
    MongoChatMessageOutboxSchemaInitializer
    mongoChatMessageOutboxSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoChatMessageOutboxSchemaInitializer(
                mongoOperations);
    }

    @Bean
    MongoChatMessageOutboxStore mongoChatMessageOutboxStore(
            MongoOperations mongoOperations,
            MongoChatMessageOutboxSchemaInitializer schemaInitializer
    ) {
        return new MongoChatMessageOutboxStore(mongoOperations);
    }

    @Bean
    ChatMessageOutboxMetricsSampler chatMessageOutboxMetricsSampler(
            MongoChatMessageOutboxStore store,
            MeterRegistry meterRegistry
    ) {
        return new ChatMessageOutboxMetricsSampler(
                store,
                meterRegistry);
    }

    @Bean
    ChatMessageOutboxDispatcher chatMessageOutboxDispatcher(
            MongoChatMessageOutboxStore store,
            ChatMessagePublisher publisher,
            ChatMessageOutboxProperties properties,
            ChatMessageOutboxMetricsSampler metricsSampler,
            LifecycleProperties lifecycleProperties,
            WebSocketTransportProperties transportProperties,
            MeterRegistry meterRegistry
    ) {
        validateProperties(
                properties,
                lifecycleProperties,
                transportProperties);
        return new ChatMessageOutboxDispatcher(
                store,
                publisher,
                properties,
                metricsSampler,
                Clock.systemUTC(),
                meterRegistry);
    }

    private static void validateProperties(
            ChatMessageOutboxProperties properties,
            LifecycleProperties lifecycleProperties,
            WebSocketTransportProperties transportProperties
    ) {
        Duration shutdownTimeout = Duration.ofMillis(
                properties.getShutdownDrainTimeoutMs());
        Duration lifecycleTimeout =
                lifecycleProperties.getTimeoutPerShutdownPhase();
        if (lifecycleTimeout == null
                || shutdownTimeout.compareTo(lifecycleTimeout) >= 0) {
            throw new IllegalStateException(
                    "chat.outbox.shutdown-drain-timeout-ms ("
                            + shutdownTimeout
                            + ") must be less than "
                            + "spring.lifecycle.timeout-per-shutdown-phase ("
                            + lifecycleTimeout + ")");
        }
        if (properties.getClaimTimeoutMs()
                <= transportProperties
                .getSendTimeLimitPerConnectionMs()) {
            throw new IllegalStateException(
                    "chat.outbox.claim-timeout-ms must be greater than "
                            + "chat.websocket.transport."
                            + "send-time-limit-per-connection-ms");
        }
        if (properties.getRetry().getInitialBackoffMs()
                > properties.getRetry().getMaxBackoffMs()) {
            throw new IllegalStateException(
                    "chat.outbox.retry.initial-backoff-ms must not "
                            + "exceed chat.outbox.retry.max-backoff-ms");
        }
    }
}
