package com.hamcheeze.chat;

import com.hamcheeze.chat.pipeline.InMemoryChatMessagePipeline;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessagePipelineTimeoutValidationTest {

    @Test
    void inMemoryModeStartsWhenDrainTimeoutIsLessThanLifecycleTimeout() {
        try (ConfigurableApplicationContext context = start(
                "in-memory",
                "10000",
                "30s")) {
            assertThat(context.getBean(
                    InMemoryChatMessagePipeline.class)).isNotNull();
        }
    }

    @Test
    void inMemoryModeFailsWhenTimeoutsAreEqual() {
        assertInvalidTimeoutRelation("30000", "PT30S");
    }

    @Test
    void inMemoryModeFailsWhenDrainTimeoutIsGreater() {
        assertInvalidTimeoutRelation("31000", "PT31S");
    }

    @Test
    void inMemoryModeFailsForRuntimeDrainTimeoutOverride() {
        assertInvalidTimeoutRelation("60000", "PT1M");
    }

    @Test
    void recordingModeIgnoresUnusedInMemoryDrainTimeout() {
        try (ConfigurableApplicationContext context = start(
                "recording",
                "60000",
                "30s")) {
            assertThat(context.isActive()).isTrue();
            assertThat(context.getBeansOfType(
                    InMemoryChatMessagePipeline.class)).isEmpty();
        }
    }

    private void assertInvalidTimeoutRelation(
            String drainTimeoutMs,
            String expectedDuration
    ) {
        assertThatThrownBy(() -> start(
                "in-memory",
                drainTimeoutMs,
                "30s"))
                .hasRootCauseInstanceOf(IllegalStateException.class)
                .rootCause()
                .hasMessageContaining(
                        "chat.message-pipeline.shutdown-drain-timeout-ms")
                .hasMessageContaining(expectedDuration)
                .hasMessageContaining(
                        "spring.lifecycle.timeout-per-shutdown-phase")
                .hasMessageContaining("PT30S");
    }

    private ConfigurableApplicationContext start(
            String mode,
            String drainTimeoutMs,
            String lifecycleTimeout
    ) {
        return new SpringApplicationBuilder(
                ChatServerApplication.class)
                .profiles("limit-test")
                .run(
                        "--server.port=0",
                        "--chat.message-pipeline.mode=" + mode,
                        "--chat.message-pipeline.shutdown-drain-timeout-ms="
                                + drainTimeoutMs,
                        "--spring.lifecycle.timeout-per-shutdown-phase="
                                + lifecycleTimeout);
    }
}
