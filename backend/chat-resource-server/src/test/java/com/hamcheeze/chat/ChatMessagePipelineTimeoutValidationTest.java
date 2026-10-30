package com.hamcheeze.chat;

import com.hamcheeze.chat.pipeline.InMemoryChatMessagePipeline;
import com.hamcheeze.chat.support.MongoRuntimeTestContainer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChatMessagePipelineTimeoutValidationTest {

    @Test
    void startsWhenDrainTimeoutIsLessThanLifecycleTimeout() {
        try (ConfigurableApplicationContext context = start(
                "10000",
                "30s")) {
            assertThat(context.getBean(
                    InMemoryChatMessagePipeline.class)).isNotNull();
        }
    }

    @Test
    void failsWhenTimeoutsAreEqual() {
        assertInvalidTimeoutRelation("30000", "PT30S");
    }

    @Test
    void failsWhenDrainTimeoutIsGreater() {
        assertInvalidTimeoutRelation("31000", "PT31S");
    }

    @Test
    void failsForRuntimeDrainTimeoutOverride() {
        assertInvalidTimeoutRelation("60000", "PT1M");
    }

    private void assertInvalidTimeoutRelation(
            String drainTimeoutMs,
        String expectedDuration
    ) {
        assertThatThrownBy(() -> start(
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
            String drainTimeoutMs,
            String lifecycleTimeout
    ) {
        return new SpringApplicationBuilder(
                ChatServerApplication.class)
                .profiles("local")
                .run(
                        "--server.port=0",
                        "--spring.mongodb.uri="
                                + MongoRuntimeTestContainer.replicaSetUrl(),
                        "--chat.message-pipeline.shutdown-drain-timeout-ms="
                                + drainTimeoutMs,
                        "--spring.lifecycle.timeout-per-shutdown-phase="
                                + lifecycleTimeout);
    }
}
