package com.hamcheeze.chat.application;

import com.hamcheeze.chat.delivery.ChatMessageEventEnvelope;
import com.hamcheeze.chat.delivery.ChatMessagePublisher;
import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.StoreChatMessageResult;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.QueuedChatCommand;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;

public final class ChatMessageProcessor {

    private static final Logger log =
            LoggerFactory.getLogger(ChatMessageProcessor.class);

    private final ChatMessageStore messageStore;
    private final ChatMessagePublisher messagePublisher;
    private final ChatCommandResultSender resultSender;
    private final AtomicInteger processing = new AtomicInteger();
    private final Counter processingFailureCounter;
    private final Counter resultSendFailureCounter;

    public ChatMessageProcessor(
            ChatMessageStore messageStore,
            ChatMessagePublisher messagePublisher,
            ChatCommandResultSender resultSender,
            MeterRegistry meterRegistry
    ) {
        this.messageStore = Objects.requireNonNull(
                messageStore, "messageStore");
        this.messagePublisher = Objects.requireNonNull(
                messagePublisher, "messagePublisher");
        this.resultSender = Objects.requireNonNull(
                resultSender, "resultSender");
        Objects.requireNonNull(meterRegistry, "meterRegistry");
        this.processingFailureCounter =
                meterRegistry.counter(
                        "chat.pipeline.processing.failures");
        this.resultSendFailureCounter =
                meterRegistry.counter(
                        "chat.command.result.send.failures");
        Gauge.builder(
                        "chat.pipeline.processing",
                        processing,
                        AtomicInteger::get)
                .register(meterRegistry);
    }

    public void process(QueuedChatCommand queuedCommand) {
        Objects.requireNonNull(queuedCommand, "queuedCommand");
        processing.incrementAndGet();
        try {
            processCommand(queuedCommand.command());
        } catch (ChatMessageStoreException exception) {
            processingFailureCounter.increment();
            AdmittedChatCommand command = queuedCommand.command();
            log.error(
                    "Chat message persistence failed: roomId={}, userId={}, connectionId={}, clientMessageId={}",
                    command.roomId(),
                    command.userId(),
                    command.connectionId(),
                    command.clientMessageId(),
                    exception);
            safeSend(
                    command,
                    new ChatCommandFailed(
                            command.clientMessageId(),
                            ChatCommandFailedCode.PERSISTENCE_FAILED,
                            true,
                            null));
        } catch (RuntimeException exception) {
            processingFailureCounter.increment();
            AdmittedChatCommand command = queuedCommand.command();
            log.error(
                    "Unexpected chat message processing failure: roomId={}, userId={}, clientMessageId={}",
                    command.roomId(),
                    command.userId(),
                    command.clientMessageId(),
                    exception);
            safeSend(
                    command,
                    new ChatCommandFailed(
                            command.clientMessageId(),
                            ChatCommandFailedCode.INTERNAL_ERROR,
                            true,
                            null));
        } finally {
            processing.decrementAndGet();
        }
    }

    private void processCommand(AdmittedChatCommand command) {
        StoreChatMessageResult result =
                messageStore.append(NewChatMessage.from(command));

        switch (result) {
            case StoredChatMessage stored ->
                    handleStored(command, stored.message());
            case DuplicateChatMessage duplicate ->
                    safeSend(
                            command,
                            new ChatCommandOutcome(
                                    command.clientMessageId(),
                                    ChatCommandOutcomeCode.DUPLICATE,
                                    duplicate.message().messageId(),
                                    duplicate.message().roomSequence()));
            case ConflictingChatMessage ignored ->
                    safeSend(
                            command,
                            new ChatCommandRejected(
                                    command.clientMessageId(),
                                    ChatCommandRejectedCode
                                            .IDEMPOTENCY_CONFLICT,
                                    false,
                                    null));
        }
    }

    private void handleStored(
            AdmittedChatCommand command,
            ChatMessage message
    ) {
        try {
            messagePublisher.publish(
                    ChatMessageEventEnvelope.messageCreated(message));
        } catch (RuntimeException exception) {
            log.error(
                    "Chat message broadcast failed after persistence: roomId={}, messageId={}, roomSequence={}, clientMessageId={}",
                    message.roomId(),
                    message.messageId(),
                    message.roomSequence(),
                    message.clientMessageId(),
                    exception);
        }

        safeSend(
                command,
                new ChatCommandOutcome(
                        command.clientMessageId(),
                        ChatCommandOutcomeCode.ACCEPTED,
                        message.messageId(),
                        message.roomSequence()));
    }

    private void safeSend(
            AdmittedChatCommand command,
            ChatCommandResult result
    ) {
        try {
            resultSender.send(
                    command.userId(),
                    command.connectionId(),
                    result);
        } catch (RuntimeException exception) {
            resultSendFailureCounter.increment();
            log.error(
                    "Failed to send chat command result: userId={}, connectionId={}, clientMessageId={}, resultType={}",
                    command.userId(),
                    command.connectionId(),
                    command.clientMessageId(),
                    result.getClass().getSimpleName(),
                    exception);
        }
    }
}
