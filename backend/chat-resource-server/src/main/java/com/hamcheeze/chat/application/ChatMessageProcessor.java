package com.hamcheeze.chat.application;

import com.hamcheeze.chat.message.ChatMessage;
import com.hamcheeze.chat.message.ChatMessageMutationResult;
import com.hamcheeze.chat.message.ChatMessageMutationStore;
import com.hamcheeze.chat.message.ChatMessageStore;
import com.hamcheeze.chat.message.ChatMessageStoreException;
import com.hamcheeze.chat.message.ConflictingChatMessage;
import com.hamcheeze.chat.message.DuplicateChatMessage;
import com.hamcheeze.chat.message.NewChatMessage;
import com.hamcheeze.chat.message.DeleteChatMessageMutation;
import com.hamcheeze.chat.message.EditChatMessageMutation;
import com.hamcheeze.chat.message.MessageMutationOutcome;
import com.hamcheeze.chat.message.StoreChatMessageResult;
import com.hamcheeze.chat.message.StoredChatMessage;
import com.hamcheeze.chat.metrics.BestEffortMetricRecorder;
import com.hamcheeze.chat.pipeline.AdmittedChatCommand;
import com.hamcheeze.chat.pipeline.AdmittedDeleteMessageCommand;
import com.hamcheeze.chat.pipeline.AdmittedEditMessageCommand;
import com.hamcheeze.chat.pipeline.AdmittedMessageCommand;
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
    private final ChatMessageMutationStore mutationStore;
    private final ChatCommandResultSender resultSender;
    private final AtomicInteger processing = new AtomicInteger();
    private final Counter processingFailureCounter;
    private final Counter resultSendFailureCounter;

    public ChatMessageProcessor(
            ChatMessageStore messageStore,
            ChatMessageMutationStore mutationStore,
            ChatCommandResultSender resultSender,
            MeterRegistry meterRegistry
    ) {
        this.messageStore = Objects.requireNonNull(
                messageStore, "messageStore");
        this.mutationStore = Objects.requireNonNull(
                mutationStore, "mutationStore");
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

    public ChatMessageProcessor(
            ChatMessageStore messageStore,
            ChatCommandResultSender resultSender,
            MeterRegistry meterRegistry
    ) {
        this(
                messageStore,
                new UnsupportedMutationStore(),
                resultSender,
                meterRegistry);
    }

    public void process(QueuedChatCommand queuedCommand) {
        Objects.requireNonNull(queuedCommand, "queuedCommand");
        processing.incrementAndGet();
        try {
            processCommand(queuedCommand.command());
        } catch (ChatMessageStoreException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.pipeline.processing.failures",
                    processingFailureCounter);
            AdmittedMessageCommand command = queuedCommand.command();
            log.error(
                    "Chat message persistence failed: roomId={}, userId={}, connectionId={}, requestId={}",
                    command.roomId(),
                    command.userId(),
                    command.connectionId(),
                    command.requestId(),
                    exception);
            safeSend(
                    command,
                    persistenceFailure(command, exception.retryable()));
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.pipeline.processing.failures",
                    processingFailureCounter);
            AdmittedMessageCommand command = queuedCommand.command();
            log.error(
                    "Unexpected chat message processing failure: roomId={}, userId={}, requestId={}",
                    command.roomId(),
                    command.userId(),
                    command.requestId(),
                    exception);
            safeSend(
                    command,
                    internalFailure(command));
        } finally {
            processing.decrementAndGet();
        }
    }

    private void processCommand(AdmittedMessageCommand command) {
        switch (command) {
            case AdmittedChatCommand send -> processCreate(send);
            case AdmittedEditMessageCommand edit ->
                    handleMutation(
                            edit,
                            mutationStore.edit(
                                    new EditChatMessageMutation(
                                            edit.userId(),
                                            edit.clientMutationId(),
                                            edit.roomId(),
                                            edit.messageId(),
                                            edit.content())));
            case AdmittedDeleteMessageCommand delete ->
                    handleMutation(
                            delete,
                            mutationStore.delete(
                                    new DeleteChatMessageMutation(
                                            delete.userId(),
                                            delete.clientMutationId(),
                                            delete.roomId(),
                                            delete.messageId())));
        }
    }

    private void processCreate(AdmittedChatCommand command) {
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

    private void handleMutation(
            AdmittedMessageCommand command,
            ChatMessageMutationResult result
    ) {
        boolean successful = result.outcome()
                == MessageMutationOutcome.UPDATED
                || result.outcome()
                == MessageMutationOutcome.UNCHANGED
                || result.outcome()
                == MessageMutationOutcome.DELETED
                || result.outcome()
                == MessageMutationOutcome.ALREADY_DELETED;
        safeSend(
                command,
                new ChatMessageMutationCommandResult(
                        result.commandType(),
                        result.clientMutationId(),
                        successful
                                ? result.outcome().name()
                                : "REJECTED",
                        successful
                                ? null
                                : result.outcome().name(),
                        false,
                        null,
                        result.messageId(),
                        result.roomSequence(),
                        result.messageVersion(),
                        result.messageState(),
                        result.replayed()));
    }

    private void handleStored(
            AdmittedChatCommand command,
            ChatMessage message
    ) {
        safeSend(
                command,
                new ChatCommandOutcome(
                        command.clientMessageId(),
                        ChatCommandOutcomeCode.ACCEPTED,
                        message.messageId(),
                        message.roomSequence()));
    }

    private void safeSend(
            AdmittedMessageCommand command,
            ChatCommandResult result
    ) {
        try {
            resultSender.send(
                    command.userId(),
                    command.connectionId(),
                    result);
        } catch (RuntimeException exception) {
            BestEffortMetricRecorder.increment(
                    "chat.command.result.send.failures",
                    resultSendFailureCounter);
            log.error(
                "Failed to send chat command result: userId={}, connectionId={}, requestId={}, resultType={}",
                    command.userId(),
                    command.connectionId(),
                    command.requestId(),
                    result.getClass().getSimpleName(),
                    exception);
        }
    }

    private static ChatCommandResult persistenceFailure(
            AdmittedMessageCommand command,
            boolean retryable
    ) {
        if (command instanceof AdmittedChatCommand send) {
            return new ChatCommandFailed(
                    send.clientMessageId(),
                    ChatCommandFailedCode.PERSISTENCE_FAILED,
                    retryable,
                    null);
        }
        return mutationFailure(
                command,
                ChatCommandFailedCode.PERSISTENCE_FAILED,
                retryable);
    }

    private static ChatCommandResult internalFailure(
            AdmittedMessageCommand command
    ) {
        if (command instanceof AdmittedChatCommand send) {
            return new ChatCommandFailed(
                    send.clientMessageId(),
                    ChatCommandFailedCode.INTERNAL_ERROR,
                    true,
                    null);
        }
        return mutationFailure(
                command,
                ChatCommandFailedCode.INTERNAL_ERROR,
                true);
    }

    private static ChatMessageMutationCommandResult mutationFailure(
            AdmittedMessageCommand command,
            ChatCommandFailedCode code,
            boolean retryable
    ) {
        return switch (command) {
            case AdmittedEditMessageCommand edit ->
                    new ChatMessageMutationCommandResult(
                            com.hamcheeze.chat.message
                                    .MessageMutationCommandType
                                    .EDIT_MESSAGE,
                            edit.clientMutationId(),
                            "FAILED",
                            code.name(),
                            retryable,
                            null,
                            edit.messageId(),
                            null,
                            null,
                            null,
                            false);
            case AdmittedDeleteMessageCommand delete ->
                    new ChatMessageMutationCommandResult(
                            com.hamcheeze.chat.message
                                    .MessageMutationCommandType
                                    .DELETE_MESSAGE,
                            delete.clientMutationId(),
                            "FAILED",
                            code.name(),
                            retryable,
                            null,
                            delete.messageId(),
                            null,
                            null,
                            null,
                            false);
            case AdmittedChatCommand ignored ->
                    throw new IllegalArgumentException(
                            "CREATE is not a mutation");
        };
    }

    private static final class UnsupportedMutationStore
            implements ChatMessageMutationStore {
        @Override
        public ChatMessageMutationResult edit(
                EditChatMessageMutation mutation
        ) {
            throw new UnsupportedOperationException(
                    "Mutation store is not configured");
        }

        @Override
        public ChatMessageMutationResult delete(
                DeleteChatMessageMutation mutation
        ) {
            throw new UnsupportedOperationException(
                    "Mutation store is not configured");
        }
    }
}
