package com.hamcheeze.chat.message.context;

import com.hamcheeze.chat.message.search.ChatMessageSearchErrorCode;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class MicrometerChatMessageContextMetricsTest {

    @Test
    void recordsBoundedContextMetricsWithoutIdentityTags() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MicrometerChatMessageContextMetrics metrics =
                new MicrometerChatMessageContextMetrics(registry);

        metrics.request();
        metrics.success(Duration.ofMillis(10));
        metrics.failure(
                ChatMessageSearchErrorCode.MESSAGE_NOT_FOUND,
                Duration.ofMillis(5));

        assertThat(registry.get("chat.message.context.requests")
                .counter().count()).isEqualTo(1);
        assertThat(registry.get("chat.message.context.duration")
                .timer().count()).isEqualTo(2);
        assertThat(registry.get("chat.message.context.failures")
                .tag("failure_kind", "MESSAGE_NOT_FOUND")
                .counter().count()).isEqualTo(1);
        assertThat(registry.getMeters())
                .flatExtracting(meter -> meter.getId().getTags())
                .noneMatch(tag -> tag.getKey().equals("roomId")
                        || tag.getKey().equals("userId")
                        || tag.getKey().equals("membershipId")
                        || tag.getKey().equals("messageId"));
    }
}
