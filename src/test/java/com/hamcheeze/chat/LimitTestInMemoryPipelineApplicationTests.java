package com.hamcheeze.chat;

import com.hamcheeze.chat.message.inmemory.InMemoryChatMessageStore;
import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.ChatMessagePipeline;
import com.hamcheeze.chat.pipeline.InMemoryChatMessagePipeline;
import com.hamcheeze.chat.pipeline.PipelineAcceptance;
import com.hamcheeze.chat.pipeline.PipelineAvailability;
import com.hamcheeze.chat.websocket.health.ChatPipelineHealthIndicator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.context.ActiveProfiles;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "chat.message-pipeline.mode=in-memory"
})
@ActiveProfiles("limit-test")
class LimitTestInMemoryPipelineApplicationTests {

    @Autowired
    private ChatMessagePipeline pipeline;

    @Autowired
    private InMemoryChatMessageStore store;

    @Autowired
    private ChatPipelineHealthIndicator pipelineHealth;

    @Value("${spring.lifecycle.timeout-per-shutdown-phase}")
    private Duration lifecyclePhaseTimeout;

    @Value("${chat.message-pipeline.shutdown-drain-timeout-ms}")
    private long pipelineDrainTimeoutMs;

    @Test
    void runsQueueStoreBroadcastAndResultCycle() throws Exception {
        assertThat(pipeline)
                .isInstanceOf(InMemoryChatMessagePipeline.class);
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
