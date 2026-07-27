package com.hamcheeze.chat.message.inmemory;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.util.UUID;

@Configuration(proxyBeanMethods = false)
public class InMemoryChatMessageStoreConfiguration {

    @Bean
    InMemoryChatMessageStore inMemoryChatMessageStore(
            MeterRegistry meterRegistry
    ) {
        return new InMemoryChatMessageStore(
                Clock.systemUTC(),
                () -> UUID.randomUUID().toString(),
                meterRegistry);
    }
}
