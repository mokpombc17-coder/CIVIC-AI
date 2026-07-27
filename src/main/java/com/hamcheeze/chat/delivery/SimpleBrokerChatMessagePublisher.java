package com.hamcheeze.chat.delivery;

import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Objects;

public final class SimpleBrokerChatMessagePublisher
        implements ChatMessagePublisher {

    private final SimpMessagingTemplate messagingTemplate;
    private final Counter successCounter;
    private final Counter failureCounter;

    public SimpleBrokerChatMessagePublisher(
            SimpMessagingTemplate messagingTemplate,
            MeterRegistry meterRegistry
    ) {
        this.messagingTemplate = Objects.requireNonNull(
                messagingTemplate, "messagingTemplate");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.successCounter =
                meterRegistry.counter("chat.message.broadcast.success");
        this.failureCounter =
                meterRegistry.counter("chat.message.broadcast.failures");
    }

    @Override
    public void publish(ChatMessageEventEnvelope event) {
        Objects.requireNonNull(event, "event");
        try {
            messagingTemplate.convertAndSend(
                    "/topic/rooms/"
                            + event.payload().roomId()
                            + "/messages",
                    event);
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.message.broadcast.failures",
                    failureCounter);
            throw exception;
        }
        BestEffortMetricRecorder.increment(
                "chat.message.broadcast.success",
                successCounter);
    }
}
