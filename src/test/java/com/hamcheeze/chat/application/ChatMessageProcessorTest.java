package com.hamcheeze.chat.application;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.QueuedChatCommand;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatMessageProcessorTest {

    private ChatMessageStore store;
    private ChatMessagePublisher publisher;
    private ChatCommandResultSender resultSender;
    private SimpleMeterRegistry meterRegistry;
    private ChatMessageProcessor processor;

    @BeforeEach
    void setUp() {
        store = mock(ChatMessageStore.class);
        publisher = mock(ChatMessagePublisher.class);
        resultSender = mock(ChatCommandResultSender.class);
        meterRegistry = new SimpleMeterRegistry();
        processor = new ChatMessageProcessor(
                store,
                publisher,
                resultSender,
                meterRegistry);
    }

    @Test
    void storedMessageIsPublishedBeforeAcceptedResult() {
        ChatMessage message = message();
        when(store.append(any()))
                .thenReturn(new StoredChatMessage(message));

        processor.process(queued());

        ArgumentCaptor<ChatMessageEventEnvelope> event =
                ArgumentCaptor.forClass(
                        ChatMessageEventEnvelope.class);
        InOrder order = inOrder(publisher, resultSender);
        order.verify(publisher).publish(event.capture());
        assertThat(event.getValue().eventVersion()).isEqualTo(1);
        assertThat(event.getValue().eventType())
                .isEqualTo("CHAT_MESSAGE_CREATED");
        assertThat(event.getValue().payload().messageId())
                .isEqualTo("message-1");
        order.verify(resultSender).send(
                "user-1",
                "connection-1",
                new ChatCommandOutcome(
                        "550e8400-e29b-41d4-a716-446655440000",
                        ChatCommandOutcomeCode.ACCEPTED,
                        "message-1",
                        1L));
    }

    @Test
    void duplicateDoesNotPublishAndReturnsOriginalIdentity() {
        when(store.append(any())).thenReturn(
                new DuplicateChatMessage(message()));

        processor.process(queued());

        verifyNoPublish();
        verify(resultSender).send(
                "user-1",
                "connection-1",
                new ChatCommandOutcome(
                        "550e8400-e29b-41d4-a716-446655440000",
                        ChatCommandOutcomeCode.DUPLICATE,
                        "message-1",
                        1L));
    }

    @Test
    void conflictingContentIsRejectedWithoutPublishing() {
        when(store.append(any())).thenReturn(
                new ConflictingChatMessage(message()));

        processor.process(queued());

        verifyNoPublish();
        verify(resultSender).send(
                "user-1",
                "connection-1",
                new ChatCommandRejected(
                        "550e8400-e29b-41d4-a716-446655440000",
                        ChatCommandRejectedCode.IDEMPOTENCY_CONFLICT,
                        false,
                        null));
    }

    @Test
    void persistenceFailureReturnsRetryableFailure() {
        when(store.append(any())).thenThrow(
                new ChatMessageStoreException("store unavailable"));

        processor.process(queued());

        verifyNoPublish();
        verify(resultSender).send(
                "user-1",
                "connection-1",
                new ChatCommandFailed(
                        "550e8400-e29b-41d4-a716-446655440000",
                        ChatCommandFailedCode.PERSISTENCE_FAILED,
                        true,
                        null));
        assertThat(meterRegistry.counter(
                "chat.pipeline.processing.failures").count())
                .isEqualTo(1);
    }

    @Test
    void broadcastFailureDoesNotPreventNextMessageProcessing() {
        when(store.append(any())).thenReturn(
                new StoredChatMessage(message("1")),
                new StoredChatMessage(message("2")));
        doThrow(new IllegalStateException("broker unavailable"))
                .doNothing()
                .when(publisher)
                .publish(any());

        assertThatCode(() -> {
            processor.process(queued("1"));
            processor.process(queued("2"));
        })
                .doesNotThrowAnyException();

        verify(resultSender).send(
                "user-1",
                "connection-1",
                new ChatCommandOutcome(
                        "550e8400-e29b-41d4-a716-446655440000",
                        ChatCommandOutcomeCode.ACCEPTED,
                        "message-1",
                        1L));
        verify(resultSender).send(
                "user-1",
                "connection-1",
                new ChatCommandOutcome(
                        "550e8400-e29b-41d4-a716-446655440001",
                        ChatCommandOutcomeCode.ACCEPTED,
                        "message-2",
                        2L));
        verify(publisher, times(2)).publish(any());
    }

    @Test
    void resultSendFailureDoesNotPreventNextMessageProcessing() {
        when(store.append(any())).thenReturn(
                new StoredChatMessage(message("1")),
                new StoredChatMessage(message("2")));
        doThrow(new IllegalStateException("session closed"))
                .doNothing()
                .when(resultSender)
                .send(eq("user-1"), eq("connection-1"), any());

        assertThatCode(() -> {
            processor.process(queued("1"));
            processor.process(queued("2"));
        })
                .doesNotThrowAnyException();

        verify(publisher, times(2)).publish(any());
        verify(resultSender, times(2)).send(
                eq("user-1"),
                eq("connection-1"),
                any());
        assertThat(meterRegistry.counter(
                "chat.command.result.send.failures").count())
                .isEqualTo(1);
    }

    private void verifyNoPublish() {
        verify(publisher, never()).publish(any());
    }

    private QueuedChatCommand queued() {
        return queued("1");
    }

    private QueuedChatCommand queued(String suffix) {
        return new QueuedChatCommand(
                new AdmittedChatCommand(
                        "user-1",
                        "connection-1",
                        "room-1",
                        clientMessageId(suffix),
                        "hello"),
                Instant.parse("2026-07-24T00:00:00Z"));
    }

    private ChatMessage message() {
        return message("1");
    }

    private ChatMessage message(String suffix) {
        long sequence = Long.parseLong(suffix);
        return new ChatMessage(
                "message-" + suffix,
                "room-1",
                sequence,
                "user-1",
                clientMessageId(suffix),
                "hello",
                Instant.parse("2026-07-24T00:00:01Z"));
    }

    private String clientMessageId(String suffix) {
        return switch (suffix) {
            case "1" -> "550e8400-e29b-41d4-a716-446655440000";
            case "2" -> "550e8400-e29b-41d4-a716-446655440001";
            default -> throw new IllegalArgumentException(
                    "Unsupported test suffix: " + suffix);
        };
    }
}
