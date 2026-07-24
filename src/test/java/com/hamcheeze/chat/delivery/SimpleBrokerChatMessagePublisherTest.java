package com.hamcheeze.chat.delivery;

import com.hamcheeze.chat.message.ChatMessage;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

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

        verify(messagingTemplate).convertAndSend(
                "/topic/rooms/room-1/messages",
                event);
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
                        "/topic/rooms/room-1/messages",
                        event);

        assertThatThrownBy(() -> publisher.publish(event))
                .isInstanceOf(IllegalStateException.class);
        assertThat(meterRegistry.counter(
                "chat.message.broadcast.failures").count())
                .isEqualTo(1);
    }

    @Test
    void externalPayloadOmitsInternalSenderUserId() throws Exception {
        ChatMessage internalMessage = message();
        ChatMessageEventEnvelope event =
                ChatMessageEventEnvelope.messageCreated(internalMessage);

        assertThat(internalMessage.senderUserId())
                .isEqualTo("user-1");
        assertThat(event.payload().getClass().getRecordComponents())
                .extracting(component -> component.getName())
                .doesNotContain("senderUserId");
        assertThat(JsonMapper.builder()
                .build()
                .writeValueAsString(event))
                .doesNotContain("senderUserId")
                .doesNotContain("\"user-1\"");
    }

    private ChatMessage message() {
        return new ChatMessage(
                "message-1",
                "room-1",
                1,
                "user-1",
                "client-1",
                "hello",
                Instant.parse("2026-07-24T00:00:00Z"));
    }
}
