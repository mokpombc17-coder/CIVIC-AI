package com.hamcheeze.chat.delivery;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.metrics.ThrowingMeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

class SimpleBrokerChatMessagePublisherTest {

    private SimpMessagingTemplate messagingTemplate;
    private SimpleMeterRegistry meterRegistry;
    private SimpleBrokerChatMessagePublisher publisher;

    @BeforeEach
    void setUp() {
        messagingTemplate = mock(SimpMessagingTemplate.class);
        meterRegistry = new SimpleMeterRegistry();
        publisher = new SimpleBrokerChatMessagePublisher(
                messagingTemplate,
                meterRegistry);
    }

    @Test
    void publishesVersionedContractToRoomTopic() {
        ChatMessageEventEnvelope event =
                ChatMessageEventEnvelope.messageCreated(message());

        publisher.publish(event);

        ArgumentCaptor<Map<String, Object>> headers =
                ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(
                eq("/topic/rooms/room-1/messages"),
                eq(event),
                headers.capture());
        assertThat(headers.getValue())
                .containsEntry(
                        ChatMessageBrokerHeaders.ROOM_SEQUENCE,
                        1L)
                .containsEntry(
                        ChatMessageBrokerHeaders.EVENT_TYPE,
                        "CHAT_MESSAGE_CREATED");
        assertThat(meterRegistry.counter(
                "chat.message.broadcast.success").count())
                .isEqualTo(1);
    }

    @Test
    void recordsAndPropagatesBrokerFailure() {
        ChatMessageEventEnvelope event =
                ChatMessageEventEnvelope.messageCreated(message());
        doThrow(new IllegalStateException("broker unavailable"))
                .when(messagingTemplate)
                .convertAndSend(
                        eq("/topic/rooms/room-1/messages"),
                        eq(event),
                        any(Map.class));

        assertThatThrownBy(() -> publisher.publish(event))
                .isInstanceOf(IllegalStateException.class);
        assertThat(meterRegistry.counter(
                "chat.message.broadcast.failures").count())
                .isEqualTo(1);
    }

    @Test
    void successMetricFailureDoesNotChangePublishSuccess() {
        ChatMessageEventEnvelope event =
                ChatMessageEventEnvelope.messageCreated(message());
        publisher = new SimpleBrokerChatMessagePublisher(
                messagingTemplate,
                ThrowingMeterRegistry.counter(
                        "chat.message.broadcast.success"));

        publisher.publish(event);

        verify(messagingTemplate).convertAndSend(
                eq("/topic/rooms/room-1/messages"),
                eq(event),
                any(Map.class));
    }

    @Test
    void failureMetricFailureDoesNotReplacePublishFailure() {
        ChatMessageEventEnvelope event =
                ChatMessageEventEnvelope.messageCreated(message());
        RuntimeException publishFailure =
                new IllegalStateException("broker unavailable");
        doThrow(publishFailure)
                .when(messagingTemplate)
                .convertAndSend(
                        eq("/topic/rooms/room-1/messages"),
                        eq(event),
                        any(Map.class));
        publisher = new SimpleBrokerChatMessagePublisher(
                messagingTemplate,
                ThrowingMeterRegistry.counter(
                        "chat.message.broadcast.failures"));

        assertThatThrownBy(() -> publisher.publish(event))
                .isSameAs(publishFailure);
    }

    @Test
    void externalPayloadIncludesSenderUserId() throws Exception {
        ChatMessage internalMessage = message();
        ChatMessageEventEnvelope event =
                ChatMessageEventEnvelope.messageCreated(internalMessage);

        assertThat(internalMessage.senderUserId())
                .isEqualTo("user-1");
        assertThat(event.payload().senderUserId())
                .isEqualTo("user-1");
        assertThat(event.payload().getClass().getRecordComponents())
                .extracting(component -> component.getName())
                .contains("senderUserId");
        assertThat(JsonMapper.builder()
                .build()
                .writeValueAsString(event))
                .contains("\"senderUserId\":\"user-1\"");
    }

    private ChatMessage message() {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "membership-1",
                "550e8400-e29b-41d4-a716-446655440000",
                "hello",
                Instant.parse("2026-07-24T00:00:00Z"));
    }
}
