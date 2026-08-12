package com.hamcheeze.chat.export;

import com.hamcheeze.chat.export.mongo.MongoChatExportJobSchemaInitializer;
import com.hamcheeze.chat.export.mongo.MongoChatExportJobStore;
import com.hamcheeze.chat.export.mongo.MongoChatExportSnapshotReader;
import com.hamcheeze.chat.message.audit.ChatMessageAuditReader;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.scheduling.annotation.EnableScheduling;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(ChatExportProperties.class)
public class ChatExportConfiguration {

    @Bean(initMethod = "initialize")
    MongoChatExportJobSchemaInitializer chatExportJobSchemaInitializer(
            MongoOperations mongoOperations
    ) {
        return new MongoChatExportJobSchemaInitializer(mongoOperations);
    }

    @Bean
    @DependsOn("chatExportJobSchemaInitializer")
    ChatExportJobStore chatExportJobStore(
            MongoOperations mongoOperations
    ) {
        return new MongoChatExportJobStore(mongoOperations);
    }

    @Bean
    ChatExportSnapshotReader chatExportSnapshotReader(
            MongoOperations mongoOperations
    ) {
        return new MongoChatExportSnapshotReader(mongoOperations);
    }

    @Bean
    Clock chatExportClock() {
        return Clock.systemUTC();
    }

    @Bean(initMethod = "initialize")
    ChatExportTempManager chatExportTempManager(
            ChatExportProperties properties,
            Clock chatExportClock,
            MeterRegistry meterRegistry
    ) {
        return new ChatExportTempManager(
                properties,
                chatExportClock,
                meterRegistry);
    }

    @Bean
    ChatExportConcurrencyGuard chatExportConcurrencyGuard(
            ChatExportProperties properties
    ) {
        return new ChatExportConcurrencyGuard(
                properties.getMaxConcurrentExports());
    }

    @Bean
    ChatExportMetrics chatExportMetrics(MeterRegistry meterRegistry) {
        return new ChatExportMetrics(meterRegistry);
    }

    @Bean
    ChatExportArtifactGenerator chatExportArtifactGenerator(
            ChatMessageAuditReader auditReader,
            ObjectMapper objectMapper,
            ChatExportProperties properties,
            ChatExportTempManager tempManager,
            Clock chatExportClock
    ) {
        return new ChatExportArtifactGenerator(
                auditReader,
                objectMapper,
                properties,
                tempManager,
                chatExportClock);
    }

    @Bean
    ChatExportService chatExportService(
            ChatExportJobStore jobStore,
            ChatMessageAuditReader auditReader,
            ChatExportSnapshotReader snapshotReader,
            ChatExportArtifactGenerator artifactGenerator,
            ChatExportTempManager tempManager,
            ChatExportConcurrencyGuard concurrencyGuard,
            ChatExportProperties properties,
            Clock chatExportClock,
            ChatExportMetrics metrics
    ) {
        return new ChatExportService(
                jobStore,
                auditReader,
                snapshotReader,
                artifactGenerator,
                tempManager,
                concurrencyGuard,
                properties,
                chatExportClock,
                metrics);
    }

    @Bean(initMethod = "recover")
    ChatExportStartupRecovery chatExportStartupRecovery(
            ChatExportJobStore jobStore,
            Clock chatExportClock
    ) {
        return new ChatExportStartupRecovery(jobStore, chatExportClock);
    }

}
