package com.hamcheeze.chat.websocket.metrics;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Component
public final class OutboundMetricsInterceptor implements ChannelInterceptor {

    private final Counter messageAttempts;
    private final Counter applicationPayloadBytes;

    public OutboundMetricsInterceptor(MeterRegistry meterRegistry) {
        this.messageAttempts =
                meterRegistry.counter("chat.outbound.message_attempts");
        this.applicationPayloadBytes =
                meterRegistry.counter(
                        "chat.outbound.application_payload_bytes");
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        SimpMessageType type =
                SimpMessageHeaderAccessor.getMessageType(message.getHeaders());
        if (type == SimpMessageType.MESSAGE) {
            BestEffortMetricRecorder.increment(
                    "chat.outbound.message_attempts",
                    messageAttempts);
            BestEffortMetricRecorder.increment(
                    "chat.outbound.application_payload_bytes",
                    applicationPayloadBytes,
                    payloadSize(message.getPayload()));
        }
        return message;
    }

    private static int payloadSize(Object payload) {
        if (payload instanceof byte[] bytes) {
            return bytes.length;
        }
        if (payload instanceof String text) {
            return text.getBytes(StandardCharsets.UTF_8).length;
        }
        return 0;
    }
}
