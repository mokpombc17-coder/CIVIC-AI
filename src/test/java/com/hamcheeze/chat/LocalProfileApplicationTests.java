package com.hamcheeze.chat;

import com.hamcheeze.chat.application.ChatMessageProcessor;
import com.hamcheeze.chat.application.RoomAuthorizationDecision;
import com.hamcheeze.chat.application.RoomAuthorizationService;
import com.hamcheeze.chat.application.local.LocalAllowListRoomAuthorizationService;
import com.hamcheeze.chat.delivery.SimpleBrokerChatMessagePublisher;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.InMemoryChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import com.hamcheeze.chat.support.RecordingChatMessagePipeline;
import com.hamcheeze.chat.websocket.config.LocalJwtProperties;
import com.hamcheeze.chat.websocket.config.LocalRoomProperties;
import com.hamcheeze.chat.websocket.health.ChatPipelineHealthIndicator;
import com.mongodb.client.MongoClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("local")
class LocalProfileApplicationTests {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private ChatMessagePipeline pipeline;

    @Autowired
    private ChatMessageProcessor processor;

    @Autowired
    private SimpleBrokerChatMessagePublisher publisher;

    @Autowired
    private InMemoryChatMessageStore store;

    @Autowired
    private JwtDecoder jwtDecoder;

    @Autowired
    private LocalJwtProperties jwtProperties;

    @Autowired
    private LocalRoomProperties roomProperties;

    @Autowired
    private RoomAuthorizationService authorizationService;

    @Autowired
    private ChatPipelineHealthIndicator pipelineHealth;

    @Value("${spring.lifecycle.timeout-per-shutdown-phase}")
    private Duration lifecyclePhaseTimeout;

    @Value("${chat.message-pipeline.shutdown-drain-timeout-ms}")
    private long pipelineDrainTimeoutMs;

    @Test
    void assemblesLocalRuntimeBeansAndRunsMessagePipeline()
            throws Exception {
        assertThat(pipeline)
                .isInstanceOf(InMemoryChatMessagePipeline.class);
        assertThat(processor).isNotNull();
        assertThat(publisher).isNotNull();
        assertThat(store).isNotNull();
        assertThat(applicationContext.getBeansOfType(
                ChatMessageStore.class))
                .hasSize(1)
                .containsValue(store);
        assertThat(applicationContext.getBeansOfType(
                MongoClient.class)).isEmpty();
        assertThat(applicationContext.getBeansOfType(
                MongoOperations.class)).isEmpty();
        assertThat(jwtDecoder).isNotNull();
        assertThat(jwtProperties.getIssuer()).isEqualTo("chat-local");
        assertThat(roomProperties.getAllowedRooms())
                .containsExactly("test-room");
        assertThat(authorizationService)
                .isInstanceOf(
                        LocalAllowListRoomAuthorizationService.class);
        assertThat(authorizationService.authorizeSubscription(
                "user-1", "test-room"))
                .isEqualTo(RoomAuthorizationDecision.ALLOWED);
        assertThat(authorizationService.authorizeMessageSend(
                "user-1", "not-allowed"))
                .isEqualTo(RoomAuthorizationDecision.FORBIDDEN);
        assertThat(applicationContext.getBeansOfType(
                RecordingChatMessagePipeline.class)).isEmpty();
        assertThat(pipeline.availability())
                .isEqualTo(PipelineAvailability.AVAILABLE);
        assertThat(pipelineHealth.health().getStatus())
                .isEqualTo(Status.UP);

        PipelineAcceptance acceptance = pipeline.tryAccept(
                new AdmittedChatCommand(
                        "local-user-1",
                        "local-connection-1",
                        "test-room",
                        "550e8400-e29b-41d4-a716-446655440000",
                        "hello"));

        assertThat(acceptance).isEqualTo(
                PipelineAcceptance.ACCEPTED_FOR_PROCESSING);
        awaitStoreSize(1, Duration.ofSeconds(2));
        assertThat(store.size()).isEqualTo(1);
    }

    @Test
    void lifecyclePhaseTimeoutExceedsPipelineDrainTimeout() {
        assertThat(lifecyclePhaseTimeout)
                .isGreaterThan(Duration.ofMillis(
                        pipelineDrainTimeoutMs));
    }

    private void awaitStoreSize(
            int expected,
            Duration timeout
    ) throws InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (store.size() != expected
                && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
    }
}
