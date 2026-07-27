package com.hamcheeze.chat.websocket.metrics;

import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.MessageBuilder;

import static org.assertj.core.api.Assertions.assertThat;

class OutboundMetricsInterceptorTest {

    @Test
    void metricFailuresDoNotBlockOutboundMessage() {
        OutboundMetricsInterceptor interceptor =
                new OutboundMetricsInterceptor(
                        ThrowingMeterRegistry.counter(
                                "chat.outbound.message_attempts",
                                "chat.outbound.application_payload_bytes"));
        SimpMessageHeaderAccessor accessor =
                SimpMessageHeaderAccessor.create(
                        SimpMessageType.MESSAGE);
        Message<byte[]> message = MessageBuilder.createMessage(
                "hello".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                accessor.getMessageHeaders());

        assertThat(interceptor.preSend(message, null))
                .isSameAs(message);
    }
}
